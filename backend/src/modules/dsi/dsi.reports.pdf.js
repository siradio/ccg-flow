const pdf = require('../../utils/pdf');
const { MONTHS } = require('./dsi.reports.service');

const money = pdf.money;
const arrow = (d) => (d == null ? '' : d > 0 ? ` (↑ ${d})` : d < 0 ? ` (↓ ${Math.abs(d)})` : ' (=)');

// Rapport mensuel DSI — PDF institutionnel (page de garde + sections §16). Utilise le socle pdf.js
// (en-tête/pied/pagination/branding). `report` = ligne dsi_reports enrichie (payload figé).
async function generateReportPdf({ report, entityNom, logoBuffer }) {
  const s = report.payload?.snapshot || {};
  const sec = report.payload?.sections || {};
  const c = s.chiffres || {};
  const cmp = s.comparaison || {};
  const L = s.listes || {};
  const moisLabel = `${MONTHS[report.mois] || report.mois} ${report.annee}`;

  return pdf.renderPdf(doc => {
    const NAVY = pdf.BRAND_NAVY;
    const H = (title) => { doc.moveDown(0.8); doc.fontSize(12).font('Helvetica-Bold').fillColor(NAVY).text(title); doc.moveDown(0.3).fontSize(10).font('Helvetica').fillColor('black'); };
    const para = (label, txt) => { if (txt && String(txt).trim()) { doc.font('Helvetica-Bold').fillColor('black').text(label + ' : ', { continued: true }).font('Helvetica').text(String(txt)); doc.moveDown(0.2); } };

    // ── Page de garde ──
    try { doc.image(logoBuffer || require('path').join(__dirname, '../../assets/logo-ccg.png'), doc.page.width / 2 - 35, 90, { fit: [70, 64], align: 'center' }); } catch { /* pas de logo */ }
    doc.moveDown(6);
    doc.fontSize(22).font('Helvetica-Bold').fillColor(NAVY).text('CCG', { align: 'center' });
    doc.moveDown(0.3).fontSize(14).text('Direction des Systèmes d’Information', { align: 'center' });
    doc.moveDown(1.5).fontSize(18).fillColor('black').text('Rapport mensuel d’activité DSI', { align: 'center' });
    doc.moveDown(0.5).fontSize(15).fillColor(NAVY).text(moisLabel, { align: 'center' });
    if (entityNom) doc.moveDown(0.3).fontSize(11).fillColor('black').text(`Périmètre : ${entityNom}`, { align: 'center' });
    doc.moveDown(3).fontSize(10).fillColor('black');
    doc.text(`Préparé par : ${report.responsable_nom || '—'}`, { align: 'center' });
    doc.text(`Statut : ${report.statut}${report.valide_par_nom ? ' — validé par ' + report.valide_par_nom : ''}`, { align: 'center' });
    doc.text(`Généré le : ${new Date(report.genere_le || Date.now()).toLocaleDateString('fr-FR')}`, { align: 'center' });

    // ── Synthèse exécutive ──
    doc.addPage();
    doc.fontSize(15).font('Helvetica-Bold').fillColor(NAVY).text('1. Synthèse exécutive');
    doc.moveDown(0.4).fontSize(10).font('Helvetica').fillColor('black');
    const sy = sec.synthese || {};
    para('Résumé du mois', sy.resume);
    para('Principales réalisations', sy.realisations);
    para('Difficultés rencontrées', sy.difficultes);
    para('Risques', sy.risques);
    para('Points nécessitant l’attention de la Direction', sy.attention);
    para('Recommandations', sy.recommandations);
    para('Décisions / arbitrages attendus', sy.decisions);
    if (!Object.values(sy).some(v => v && String(v).trim())) doc.fillColor(pdf.MUTED_GRAY).text('(Partie managériale à compléter par le Responsable DSI.)').fillColor('black');

    // ── Chiffres clés ──
    H('2. Chiffres clés');
    const t = c.tickets || {}; const parc = c.parc || {}; const mnt = c.maintenance || {}; const prj = c.projets || {}; const rsq = c.risques || {};
    pdf.simpleTable(doc, [
      { key: 'ind', label: 'Indicateur', width: 300 },
      { key: 'val', label: 'Valeur', width: 130, align: 'right' },
      { key: 'cmp', label: 'vs mois préc.', width: 85, align: 'right' },
    ], [
      { ind: 'Tickets reçus', val: t.recus ?? 0, cmp: arrow(cmp.tickets_recus).trim() },
      { ind: 'Tickets résolus', val: t.resolus ?? 0, cmp: arrow(cmp.tickets_resolus).trim() },
      { ind: 'Tickets ouverts (fin de période)', val: t.ouverts ?? 0, cmp: '' },
      { ind: 'Incidents critiques', val: t.incidents_critiques ?? 0, cmp: arrow(cmp.incidents_critiques).trim() },
      { ind: 'Taux de résolution', val: t.taux_resolution == null ? '—' : t.taux_resolution + ' %', cmp: '' },
      { ind: 'Respect SLA', val: t.sla_pct == null ? '—' : t.sla_pct + ' %', cmp: cmp.sla_pct == null ? '' : (cmp.sla_pct > 0 ? '↑ ' : cmp.sla_pct < 0 ? '↓ ' : '') + Math.abs(cmp.sla_pct) + ' pts' },
      { ind: 'Délai moyen de résolution', val: t.mttr_min == null ? '—' : t.mttr_min + ' min', cmp: '' },
      { ind: 'Parc total / affectés / en panne', val: `${parc.total ?? 0} / ${parc.affectes ?? 0} / ${parc.en_panne ?? 0}`, cmp: '' },
      { ind: 'Équipements hors garantie / nouveaux', val: `${parc.hors_garantie ?? 0} / ${parc.nouveaux ?? 0}`, cmp: '' },
      { ind: 'Maintenances réalisées / coût', val: `${mnt.realisees ?? 0} / ${money(mnt.cout)} `, cmp: '' },
      { ind: 'Projets en cours / en retard', val: `${prj.en_cours ?? 0} / ${prj.en_retard ?? 0}`, cmp: '' },
      { ind: 'Risques critiques / élevés', val: `${rsq.critiques ?? 0} / ${rsq.eleves ?? 0}`, cmp: '' },
    ]);

    // ── Incidents majeurs ──
    H('3. Incidents majeurs (critiques)');
    pdf.simpleTable(doc, [
      { key: 'reference', label: 'Réf.', width: 90 },
      { key: 'date', label: 'Date', width: 70 },
      { key: 'objet', label: 'Incident', width: 200 },
      { key: 'statut', label: 'Statut', width: 95 },
    ], (L.incidentsMajeurs || []).map(x => ({ ...x, date: new Date(x.created_at).toLocaleDateString('fr-FR') })));

    // ── Activités DSI ──
    H('4. Activités DSI');
    pdf.simpleTable(doc, [
      { key: 'label', label: 'Type d’activité', width: 320 },
      { key: 'n', label: 'Nombre', width: 70, align: 'right' },
      { key: 'duree', label: 'Durée (min)', width: 105, align: 'right' },
    ], L.activitesParType || []);
    if ((L.faitsMarquants || []).length) {
      doc.moveDown(0.3).font('Helvetica-Bold').text('Faits marquants :').font('Helvetica');
      (L.faitsMarquants).forEach(f => doc.text(`• ${new Date(f.date).toLocaleDateString('fr-FR')} — ${f.description}`));
    }

    // ── Projets IT ──
    H('5. Projets IT');
    pdf.simpleTable(doc, [
      { key: 'nom', label: 'Projet', width: 160 },
      { key: 'responsable', label: 'Responsable', width: 110 },
      { key: 'avancement', label: 'Avanc.', width: 50, align: 'right' },
      { key: 'echeance', label: 'Échéance', width: 70 },
      { key: 'statut', label: 'Statut', width: 105 },
    ], (L.projets || []).map(p => ({ ...p, avancement: (p.avancement_pct ?? 0) + '%', echeance: p.date_fin_prevue ? new Date(p.date_fin_prevue).toLocaleDateString('fr-FR') : '—' })));

    // ── Risques ──
    H('6. Risques et points d’attention');
    pdf.simpleTable(doc, [
      { key: 'sujet', label: 'Sujet', width: 220 },
      { key: 'criticite', label: 'Criticité', width: 80 },
      { key: 'responsable', label: 'Responsable', width: 110 },
      { key: 'echeance', label: 'Échéance', width: 85 },
    ], (L.risques || []).map(r => ({ ...r, echeance: r.echeance ? new Date(r.echeance).toLocaleDateString('fr-FR') : '—' })));

    // ── Plan d'action ──
    H('7. Plan d’action');
    pdf.simpleTable(doc, [
      { key: 'libelle', label: 'Action', width: 300 },
      { key: 'echeance', label: 'Échéance', width: 90 },
      { key: 'statut', label: 'Statut', width: 105 },
    ], (report.actions || []).map(a => ({ ...a, echeance: a.echeance ? new Date(a.echeance).toLocaleDateString('fr-FR') : '—' })));

    // Analyses complémentaires
    if (sec.analyses && Object.values(sec.analyses).some(v => v && String(v).trim())) {
      H('8. Analyses');
      para('SLA / performance', sec.analyses.sla);
      para('Maintenance', sec.analyses.maintenance);
      para('Sécurité', sec.analyses.securite);
    }
  });
}

module.exports = { generateReportPdf };
