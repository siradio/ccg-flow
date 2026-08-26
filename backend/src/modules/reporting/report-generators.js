const { all } = require('../../db');
const { renderPdf, renderLetterhead, simpleTable, BRAND_NAVY } = require('../../utils/pdf');
const { drawLineChart, drawBarChart } = require('./report-chart');
const { chartLinePng, chartBarPng } = require('./report-chart-img');

// Ajoute l'image du graphique (PNG inline via CID) au corps du mail, sous le tableau.
async function withChartImg(bodyHtml, attachments, pngPromise, title) {
  const png = await pngPromise;
  if (!png) return bodyHtml;
  attachments.push({ filename: 'graphique.png', content: png, cid: 'chart', contentType: 'image/png' });
  return bodyHtml + `<h3 style="font-size:15px;color:#1d2b53;margin:16px 0 6px">${title}</h3>`
    + `<img src="cid:chart" alt="${title}" style="max-width:100%;height:auto;border:1px solid #eee;border-radius:6px"/>`;
}

// Génération des rapports : chaque type renvoie { subject, bodyHtml, attachments }.
// Données par SQL direct (filtre BU optionnel via la planification). Documents en français.

// Séparateur de milliers avec espace ASCII normale (pdfkit/Helvetica ne rend pas l'espace fine
// insécable U+202F de toLocaleString — elle apparaîtrait comme « / »). OK aussi en HTML.
const qty = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const iso = (d) => d.toISOString().slice(0, 10);
const fmtDate = (s) => String(s).slice(0, 10).split('-').reverse().join('/');
const todayISO = () => iso(new Date());
function daysAgoISO(n) { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); }

// Fenêtre & granularité selon la fréquence.
function windowFor(frequence) {
  if (frequence === 'mensuel') return { from: daysAgoISO(364), to: todayISO(), unit: 'month', granLabel: 'mois' };
  if (frequence === 'hebdomadaire') return { from: daysAgoISO(83), to: todayISO(), unit: 'week', granLabel: 'semaine' };
  return { from: daysAgoISO(29), to: todayISO(), unit: 'day', granLabel: 'jour' };
}
const bucketLabel = (unit) => (b) => { const [y, m, d] = b.split('-'); return unit === 'month' ? `${m}/${y.slice(2)}` : `${d}/${m}`; };

const STATUT_ACHAT = {
  brouillon: 'Brouillon', soumise: 'Soumise', en_analyse_achat: 'En analyse achat', devis_en_cours: 'Devis en cours',
  devis_selectionne: 'Devis sélectionné', en_validation: 'En validation', en_attente_validation: 'En attente de validation',
  validee: 'Validée', rejetee: 'Rejetée', refusee: 'Refusée', commandee: 'Commandée', recue: 'Reçue', cloturee: 'Clôturée',
  bon_commande_genere: 'Bon de commande généré',
};

// --- HTML helpers (corps d'e-mail) ---------------------------------------------------------
function tableHtml(title, headers, rows, footer) {
  const th = headers.map((h, i) => `<th style="text-align:${i === 0 ? 'left' : 'right'};padding:6px 8px;border-bottom:2px solid #d1d5db;font-size:12px;color:#374151">${h}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map((c, i) => `<td style="text-align:${i === 0 ? 'left' : 'right'};padding:5px 8px;border-bottom:1px solid #eee;font-size:13px">${c}</td>`).join('')}</tr>`).join('');
  const foot = footer ? `<tr>${footer.map((c, i) => `<td style="text-align:${i === 0 ? 'left' : 'right'};padding:6px 8px;font-weight:700;border-top:2px solid #d1d5db;font-size:13px">${c}</td>`).join('')}</tr>` : '';
  return `<h3 style="font-size:15px;color:#1d2b53;margin:16px 0 6px">${title}</h3>
    <table style="width:100%;border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${body}${foot}</tbody></table>`;
}

// --- Production par BU ---------------------------------------------------------------------
async function production_bu(schedule) {
  const { from, to, unit, granLabel } = windowFor(schedule.frequence);
  const params = [from, to];
  let buWhere = '';
  if (schedule.business_unit_id) { params.push(schedule.business_unit_id); buWhere = ` AND p.business_unit_id = $${params.length}`; }
  const rows = await all(`
    SELECT to_char(date_trunc('${unit}', pe.date_production), 'YYYY-MM-DD') AS bucket,
           COALESCE(p.business_unit_id, 0) AS buid, COALESCE(bu.nom, '—') AS bu_nom, SUM(pe.quantite) AS valeur
      FROM production_entries pe
      JOIN products p ON p.id = pe.product_id
      LEFT JOIN business_units bu ON bu.id = p.business_unit_id
     WHERE pe.date_production >= $1 AND pe.date_production <= $2${buWhere}
       AND (p.type_article IS NULL OR p.type_article <> 'matiere_premiere')
     GROUP BY 1, 2, 3 ORDER BY 1`, params);

  const buckets = [...new Set(rows.map(r => r.bucket))].sort();
  const buMap = {};
  for (const r of rows) { const k = r.buid; (buMap[k] || (buMap[k] = { name: r.bu_nom, m: {} })).m[r.bucket] = Number(r.valeur); }
  const series = Object.values(buMap).map(b => ({ name: b.name, points: buckets.map(bk => b.m[bk] || 0) }));
  const labels = buckets.map(bucketLabel(unit));
  const totals = Object.values(buMap).map(b => ({ bu: b.name, total: buckets.reduce((s, bk) => s + (b.m[bk] || 0), 0) })).sort((a, b) => b.total - a.total);
  const grand = totals.reduce((s, t) => s + t.total, 0);
  const periodStr = `${fmtDate(from)} au ${fmtDate(to)}`;

  let bodyHtml = `<p style="font-size:13px;color:#374151">Période : <strong>${periodStr}</strong> — granularité : ${granLabel}.</p>`
    + tableHtml('Production par BU', ['BU', 'Quantité produite'], totals.map(t => [t.bu, qty(t.total)]), ['TOTAL', qty(grand)]);

  const attachments = [];
  if (schedule.format === 'pdf') {
    const buf = await renderPdf(doc => {
      renderLetterhead(doc, 'Rapport Production');
      doc.fontSize(10).font('Helvetica').fillColor('black').text(`Période : ${periodStr}    —    Granularité : ${granLabel}`);
      doc.moveDown(0.6).fontSize(11).font('Helvetica-Bold').fillColor(BRAND_NAVY).text('Évolution de la production par BU');
      doc.moveDown(0.4).fillColor('black');
      if (series.length) drawLineChart(doc, { series, labels }); else doc.fontSize(10).text('Aucune donnée sur la période.');
      doc.moveDown(0.6).fontSize(11).font('Helvetica-Bold').fillColor(BRAND_NAVY).text('Totaux par BU');
      doc.moveDown(0.3).fillColor('black');
      simpleTable(doc, [{ key: 'bu', label: 'BU', width: 300 }, { key: 'total', label: 'Quantité produite', width: 195, align: 'right' }],
        totals.map(t => ({ bu: t.bu, total: qty(t.total) })).concat([{ bu: 'TOTAL', total: qty(grand) }]));
    });
    attachments.push({ filename: `Rapport_Production_${to}.pdf`, content: buf, contentType: 'application/pdf' });
  }
  if (series.length) bodyHtml = await withChartImg(bodyHtml, attachments, chartLinePng({ series, labels }), "Évolution de la production par BU");
  bodyHtml += `<p style="font-size:12px;color:#6b7280;margin-top:10px">Rapport complet en PDF joint.</p>`;
  return { subject: `Rapport Production — ${periodStr}`, bodyHtml, attachments };
}

// --- Stock par BU -------------------------------------------------------------------------
async function stock_bu(schedule) {
  const to = todayISO();
  const params = [to];
  let buWhere = '';
  if (schedule.business_unit_id) { params.push(schedule.business_unit_id); buWhere = ` AND p.business_unit_id = $${params.length}`; }
  const rows = await all(`
    SELECT COALESCE(bu.nom, '—') AS bu_nom, SUM(latest.quantite) AS quantite, COUNT(*) AS refs
      FROM (SELECT DISTINCT ON (se.product_id) se.product_id, se.quantite
              FROM stock_entries se WHERE se.date_stock <= $1
             ORDER BY se.product_id, se.date_stock DESC) latest
      JOIN products p ON p.id = latest.product_id
      LEFT JOIN business_units bu ON bu.id = p.business_unit_id
     WHERE TRUE${buWhere}
     GROUP BY bu.nom ORDER BY quantite DESC`, params);
  const items = rows.map(r => ({ label: r.bu_nom, value: Number(r.quantite) }));
  const grand = rows.reduce((s, r) => s + Number(r.quantite), 0);

  let bodyHtml = `<p style="font-size:13px;color:#374151">Situation au <strong>${fmtDate(to)}</strong> (dernier relevé par produit).</p>`
    + tableHtml('État du stock par BU', ['BU', 'Quantité en stock', 'Références'], rows.map(r => [r.bu_nom, qty(r.quantite), r.refs]), ['TOTAL', qty(grand), '']);

  const attachments = [];
  if (schedule.format === 'pdf') {
    const buf = await renderPdf(doc => {
      renderLetterhead(doc, 'Rapport Stock');
      doc.fontSize(10).font('Helvetica').fillColor('black').text(`Situation au ${fmtDate(to)}`);
      doc.moveDown(0.6).fontSize(11).font('Helvetica-Bold').fillColor(BRAND_NAVY).text('Stock par BU');
      doc.moveDown(0.4).fillColor('black');
      if (items.length) drawBarChart(doc, { items }); else doc.fontSize(10).text('Aucune donnée.');
      doc.moveDown(0.4);
      simpleTable(doc, [{ key: 'bu', label: 'BU', width: 250 }, { key: 'q', label: 'Quantité', width: 150, align: 'right' }, { key: 'r', label: 'Réf.', width: 95, align: 'right' }],
        rows.map(r => ({ bu: r.bu_nom, q: qty(r.quantite), r: r.refs })).concat([{ bu: 'TOTAL', q: qty(grand), r: '' }]));
    });
    attachments.push({ filename: `Rapport_Stock_${to}.pdf`, content: buf, contentType: 'application/pdf' });
  }
  if (items.length) bodyHtml = await withChartImg(bodyHtml, attachments, chartBarPng({ items }), 'Stock par BU');
  bodyHtml += `<p style="font-size:12px;color:#6b7280;margin-top:10px">Rapport complet en PDF joint.</p>`;
  return { subject: `Rapport Stock — ${fmtDate(to)}`, bodyHtml, attachments };
}

// --- Achats (par statut / entité / devise) ------------------------------------------------
async function achats(schedule) {
  const { from, to } = windowFor(schedule.frequence);
  const byStatus = await all(`SELECT status, COUNT(*) AS n, COALESCE(SUM(montant_final),0) AS montant FROM purchase_requests WHERE created_at >= $1 GROUP BY status ORDER BY n DESC`, [from]);
  const byEntity = await all(`SELECT e.code, COUNT(*) AS n FROM purchase_requests pr JOIN entities e ON e.id = pr.entity_id WHERE pr.created_at >= $1 GROUP BY e.code ORDER BY n DESC`, [from]);
  const byDevise = await all(`SELECT devise, COALESCE(SUM(montant_final),0) AS total FROM purchase_requests WHERE status = 'bon_commande_genere' AND created_at >= $1 GROUP BY devise`, [from]);
  const periodStr = `${fmtDate(from)} au ${fmtDate(to)}`;
  const sLabel = (s) => STATUT_ACHAT[s] || s;

  let bodyHtml = `<p style="font-size:13px;color:#374151">Période : <strong>${periodStr}</strong>.</p>`
    + tableHtml("Demandes d'achat par statut", ['Statut', 'Nombre', 'Montant final'], byStatus.map(r => [sLabel(r.status), r.n, qty(r.montant) + ' GNF']))
    + tableHtml('Par entité', ['Entité', 'Nombre'], byEntity.map(r => [r.code, r.n]))
    + tableHtml('Bons de commande par devise', ['Devise', 'Montant'], byDevise.map(r => [r.devise, qty(r.total)]));

  const items = byStatus.map(r => ({ label: sLabel(r.status), value: Number(r.n) }));
  const attachments = [];
  if (schedule.format === 'pdf') {
    const buf = await renderPdf(doc => {
      renderLetterhead(doc, 'Rapport Achats');
      doc.fontSize(10).font('Helvetica').fillColor('black').text(`Période : ${periodStr}`);
      doc.moveDown(0.6).fontSize(11).font('Helvetica-Bold').fillColor(BRAND_NAVY).text("Demandes d'achat par statut");
      doc.moveDown(0.4).fillColor('black');
      if (items.length) drawBarChart(doc, { items });
      simpleTable(doc, [{ key: 's', label: 'Statut', width: 240 }, { key: 'n', label: 'Nombre', width: 110, align: 'right' }, { key: 'm', label: 'Montant (GNF)', width: 145, align: 'right' }],
        byStatus.map(r => ({ s: sLabel(r.status), n: r.n, m: qty(r.montant) })));
      doc.moveDown(0.5).fontSize(11).font('Helvetica-Bold').fillColor(BRAND_NAVY).text('Par entité');
      doc.moveDown(0.3).fillColor('black');
      simpleTable(doc, [{ key: 'e', label: 'Entité', width: 350 }, { key: 'n', label: 'Nombre', width: 145, align: 'right' }], byEntity.map(r => ({ e: r.code, n: r.n })));
    });
    attachments.push({ filename: `Rapport_Achats_${to}.pdf`, content: buf, contentType: 'application/pdf' });
  }
  if (items.length) bodyHtml = await withChartImg(bodyHtml, attachments, chartBarPng({ items }), "Demandes d'achat par statut");
  bodyHtml += `<p style="font-size:12px;color:#6b7280;margin-top:10px">Rapport complet en PDF joint.</p>`;
  return { subject: `Rapport Achats — ${periodStr}`, bodyHtml, attachments };
}

const GENERATORS = { production_bu, stock_bu, achats };
const REPORT_TYPES = [
  { code: 'production_bu', libelle: 'Production par BU (avec courbe)' },
  { code: 'stock_bu', libelle: 'Stock par BU' },
  { code: 'achats', libelle: 'Achats (par statut / entité)' },
];

async function generateReport(code, schedule) {
  const g = GENERATORS[code];
  if (!g) throw new Error('Type de rapport inconnu : ' + code);
  return g(schedule);
}

module.exports = { generateReport, REPORT_TYPES };
