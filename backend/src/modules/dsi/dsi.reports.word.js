const { MONTHS } = require('./dsi.reports.service');

// Export Word du rapport mensuel DSI. On produit un document HTML servi en application/msword :
// Word l'ouvre nativement et il reste entièrement modifiable, sans dépendance lourde (.docx) et
// sans aucune mention d'auto-génération. Rendu A4, tableaux, sections.
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const dfr = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const arrow = (d) => (d == null ? '' : d > 0 ? ` (↑ ${d})` : d < 0 ? ` (↓ ${Math.abs(d)})` : ' (=)');

function table(headers, rows) {
  if (!rows || !rows.length) return '<p style="color:#666">Aucune donnée.</p>';
  const th = headers.map(h => `<th style="background:#1f3b73;color:#fff;padding:6px;text-align:left;border:1px solid #ccc">${esc(h)}</th>`).join('');
  const tr = rows.map(r => '<tr>' + r.map(c => `<td style="padding:6px;border:1px solid #ccc">${esc(c)}</td>`).join('') + '</tr>').join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:11pt;margin:6px 0">${'<tr>' + th + '</tr>'}${tr}</table>`;
}
const para = (label, txt) => (txt && String(txt).trim() ? `<p><strong>${esc(label)} :</strong> ${esc(txt).replace(/\n/g, '<br/>')}</p>` : '');

function generateReportWord(report, entityNom) {
  const s = report.payload?.snapshot || {};
  const sec = report.payload?.sections || {};
  const meta = sec.meta || {};
  const c = s.chiffres || {}; const t = c.tickets || {}; const parc = c.parc || {}; const mnt = c.maintenance || {}; const prj = c.projets || {}; const rsq = c.risques || {};
  const cmp = s.comparaison || {}; const L = s.listes || {};
  const moisLabel = `${MONTHS[report.mois] || report.mois} ${report.annee}`;
  const sy = sec.synthese || {};
  const h = (n) => `<h2 style="color:#1f3b73;font-size:14pt;border-bottom:1px solid #ccc;padding-bottom:2px">${n}</h2>`;

  const body = `
  <div style="text-align:center;margin:40px 0">
    <div style="font-size:22pt;font-weight:bold;color:#1f3b73">CCG</div>
    <div style="font-size:14pt;color:#1f3b73">Direction des Systèmes d'Information</div>
    <div style="font-size:18pt;margin-top:24px">Rapport mensuel d'activité DSI</div>
    <div style="font-size:15pt;color:#1f3b73;margin-top:6px">${esc(moisLabel)}</div>
    ${entityNom ? `<div style="margin-top:6px">Périmètre : ${esc(entityNom)}</div>` : ''}
    <div style="margin-top:24px">${meta.prepare_par || report.responsable_nom ? 'Préparé par : ' + esc(meta.prepare_par || report.responsable_nom) : ''}</div>
    ${meta.valide_par || report.valide_par_nom ? `<div>Validé par : ${esc(meta.valide_par || report.valide_par_nom)}</div>` : ''}
  </div>
  <hr/>
  ${h('1. Synthèse exécutive')}
  ${para('Résumé du mois', sy.resume)}${para('Principales réalisations', sy.realisations)}${para('Difficultés rencontrées', sy.difficultes)}
  ${para('Risques', sy.risques)}${para("Points nécessitant l'attention de la Direction", sy.attention)}${para('Recommandations', sy.recommandations)}${para('Décisions / arbitrages attendus', sy.decisions)}
  ${h('2. Chiffres clés')}
  ${table(['Indicateur', 'Valeur', 'vs mois préc.'], [
    ['Tickets reçus', t.recus ?? 0, arrow(cmp.tickets_recus).trim()],
    ['Tickets résolus', t.resolus ?? 0, arrow(cmp.tickets_resolus).trim()],
    ['Tickets ouverts', t.ouverts ?? 0, ''],
    ['Incidents critiques', t.incidents_critiques ?? 0, arrow(cmp.incidents_critiques).trim()],
    ['Taux de résolution', t.taux_resolution == null ? '—' : t.taux_resolution + ' %', ''],
    ['Respect SLA', t.sla_pct == null ? '—' : t.sla_pct + ' %', cmp.sla_pct == null ? '' : (cmp.sla_pct > 0 ? '↑ ' : cmp.sla_pct < 0 ? '↓ ' : '') + Math.abs(cmp.sla_pct) + ' pts'],
    ['Délai moyen de résolution', t.mttr_min == null ? '—' : t.mttr_min + ' min', ''],
    ['Parc total / affectés / en panne', `${parc.total ?? 0} / ${parc.affectes ?? 0} / ${parc.en_panne ?? 0}`, ''],
    ['Maintenances réalisées / coût', `${mnt.realisees ?? 0} / ${money(mnt.cout)}`, ''],
    ['Projets en cours / en retard', `${prj.en_cours ?? 0} / ${prj.en_retard ?? 0}`, ''],
    ['Risques critiques / élevés', `${rsq.critiques ?? 0} / ${rsq.eleves ?? 0}`, ''],
  ])}
  ${h('3. Incidents majeurs (critiques)')}
  ${table(['Réf.', 'Date', 'Incident', 'Statut'], (L.incidentsMajeurs || []).map(x => [x.reference, dfr(x.created_at), x.objet, x.statut]))}
  ${h('4. Activités DSI')}
  ${table(['Type', 'Nombre', 'Durée (min)'], (L.activitesParType || []).map(x => [x.label, x.n, x.duree]))}
  ${(L.faitsMarquants || []).length ? '<p><strong>Faits marquants :</strong></p><ul>' + L.faitsMarquants.map(f => `<li>${dfr(f.date)} — ${esc(f.description)}</li>`).join('') + '</ul>' : ''}
  ${h('5. Projets IT')}
  ${table(['Projet', 'Responsable', 'Avanc.', 'Échéance', 'Statut'], (L.projets || []).map(p => [p.nom, p.responsable, (p.avancement_pct ?? 0) + '%', dfr(p.date_fin_prevue), p.statut]))}
  ${h('6. Risques et points d\'attention')}
  ${table(['Sujet', 'Criticité', 'Responsable', 'Échéance'], (L.risques || []).map(r => [r.sujet, r.criticite, r.responsable, dfr(r.echeance)]))}
  ${h("7. Plan d'action")}
  ${table(['Action', 'Échéance', 'Statut'], (report.actions || []).map(a => [a.libelle, dfr(a.echeance), a.statut]))}
  ${sec.analyses && Object.values(sec.analyses).some(v => v && String(v).trim()) ? h('8. Analyses') + para('SLA / performance', sec.analyses.sla) + para('Maintenance', sec.analyses.maintenance) + para('Sécurité', sec.analyses.securite) : ''}
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport DSI ${esc(moisLabel)}</title></head>
  <body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222">${body}</body></html>`;
}

module.exports = { generateReportWord };
