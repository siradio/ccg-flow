const { one, all, run, withTransaction } = require('../../db');
const audit = require('../audit/audit.service');
const { httpError } = require('../../utils/httpError');

function monthRange(annee, mois) {
  const from = `${annee}-${String(mois).padStart(2, '0')}-01`;
  const nextM = mois === 12 ? 1 : mois + 1;
  const nextY = mois === 12 ? annee + 1 : annee;
  const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return { from, to };
}

// Filtre entité optionnel (null = toutes filiales).
function entClause(col, entityId, params) {
  if (!entityId) return '';
  params.push(entityId);
  return ` AND ${col} = $${params.length}`;
}

// KPI d'un mois (tickets/maintenance/activités bornés à la période ; parc = photo à l'instant t).
async function monthKpis(annee, mois, entityId) {
  const { from, to } = monthRange(annee, mois);
  const eqP = []; const eqE = entClause('e.entity_id', entityId, eqP);
  const parc = await one(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE e.statut='affecte')::int AS affectes,
            COUNT(*) FILTER (WHERE e.statut='en_panne')::int AS en_panne,
            COUNT(*) FILTER (WHERE e.statut='en_maintenance')::int AS en_maintenance,
            COUNT(*) FILTER (WHERE e.fin_garantie IS NOT NULL AND e.fin_garantie < CURRENT_DATE)::int AS hors_garantie,
            COUNT(*) FILTER (WHERE e.created_at >= $${eqP.length + 1} AND e.created_at < $${eqP.length + 2})::int AS nouveaux
     FROM dsi_equipment e WHERE e.deleted_at IS NULL ${eqE}`, [...eqP, from, to]);

  const tP = []; const tE = entClause('t.entity_id', entityId, tP);
  const tk = await one(
    `SELECT COUNT(*) FILTER (WHERE t.created_at >= $${tP.length + 1} AND t.created_at < $${tP.length + 2})::int AS recus,
            COUNT(*) FILTER (WHERE t.resolved_at >= $${tP.length + 1} AND t.resolved_at < $${tP.length + 2})::int AS resolus,
            COUNT(*) FILTER (WHERE t.statut NOT IN ('resolu','cloture','annule'))::int AS ouverts,
            COUNT(*) FILTER (WHERE p.code='critique' AND t.created_at >= $${tP.length + 1} AND t.created_at < $${tP.length + 2})::int AS incidents_critiques,
            ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at))/60) FILTER (WHERE t.resolved_at >= $${tP.length + 1} AND t.resolved_at < $${tP.length + 2}))::int AS mttr_min,
            COUNT(*) FILTER (WHERE t.resolved_at >= $${tP.length + 1} AND t.resolved_at < $${tP.length + 2} AND t.sla_resolution_min IS NOT NULL)::int AS res_avec_sla,
            COUNT(*) FILTER (WHERE t.resolved_at >= $${tP.length + 1} AND t.resolved_at < $${tP.length + 2} AND t.sla_resolution_min IS NOT NULL AND t.resolved_at <= t.created_at + (t.sla_resolution_min||' minutes')::interval)::int AS res_dans_sla
     FROM dsi_tickets t LEFT JOIN dsi_priorities p ON p.id=t.priority_id WHERE 1=1 ${tE}`, [...tP, from, to]);
  const sla_pct = tk.res_avec_sla ? Math.round((tk.res_dans_sla / tk.res_avec_sla) * 100) : null;
  const taux_resolution = tk.recus ? Math.round((tk.resolus / tk.recus) * 100) : null;

  const maint = await one(
    `SELECT COUNT(*) FILTER (WHERE statut='terminee' AND date_fin >= $1 AND date_fin < $2)::int AS realisees,
            COUNT(*) FILTER (WHERE type_id IN (SELECT id FROM dsi_maintenance_types WHERE code='preventive') AND date_fin >= $1 AND date_fin < $2)::int AS preventives,
            COUNT(*) FILTER (WHERE type_id IN (SELECT id FROM dsi_maintenance_types WHERE code='corrective') AND date_fin >= $1 AND date_fin < $2)::int AS correctives,
            COUNT(*) FILTER (WHERE statut='planifiee' AND date_debut < CURRENT_DATE)::int AS en_retard,
            COALESCE(SUM(cout) FILTER (WHERE date_fin >= $1 AND date_fin < $2),0) AS cout
     FROM dsi_maintenance`, [from, to]);

  const pP = []; const pE = entClause('entity_id', entityId, pP);
  const proj = await one(
    `SELECT COUNT(*) FILTER (WHERE statut='en_cours')::int AS en_cours,
            COUNT(*) FILTER (WHERE statut NOT IN ('termine','annule') AND date_fin_prevue < CURRENT_DATE)::int AS en_retard
     FROM dsi_projects WHERE deleted_at IS NULL ${pE}`, pP);

  const risq = await one(
    `SELECT COUNT(*) FILTER (WHERE criticite='critique' AND statut<>'clos')::int AS critiques,
            COUNT(*) FILTER (WHERE criticite='eleve' AND statut<>'clos')::int AS eleves FROM dsi_risks`);

  return {
    parc, tickets: { ...tk, sla_pct, taux_resolution },
    maintenance: maint, projets: proj, risques: risq,
  };
}

async function computeSnapshot(annee, mois, entityId) {
  const { from, to } = monthRange(annee, mois);
  const cur = await monthKpis(annee, mois, entityId);
  const prevM = mois === 1 ? 12 : mois - 1;
  const prevY = mois === 1 ? annee - 1 : annee;
  const prev = await monthKpis(prevY, prevM, entityId);

  // Listes détaillées
  const tP = []; const tE = entClause('t.entity_id', entityId, tP);
  const incidentsMajeurs = await all(
    `SELECT t.reference, t.created_at, t.objet, t.impact, t.statut
     FROM dsi_tickets t LEFT JOIN dsi_priorities p ON p.id=t.priority_id
     WHERE p.code='critique' AND t.created_at >= $${tP.length + 1} AND t.created_at < $${tP.length + 2} ${tE}
     ORDER BY t.created_at`, [...tP, from, to]);
  const ticketsParCategorie = await all(
    `SELECT COALESCE(tc.libelle,'—') AS label, COUNT(*)::int AS n
     FROM dsi_tickets t LEFT JOIN dsi_ticket_categories tc ON tc.id=t.category_id
     WHERE t.created_at >= $${tP.length + 1} AND t.created_at < $${tP.length + 2} ${tE}
     GROUP BY tc.libelle ORDER BY n DESC`, [...tP, from, to]);

  const aP = []; const aE = entClause('a.entity_id', entityId, aP);
  const activitesParType = await all(
    `SELECT COALESCE(at.libelle,'—') AS label, COUNT(*)::int AS n, COALESCE(SUM(a.duree_min),0)::int AS duree
     FROM dsi_activities a LEFT JOIN dsi_activity_types at ON at.id=a.type_id
     WHERE a.date >= $${aP.length + 1} AND a.date < $${aP.length + 2} ${aE}
     GROUP BY at.libelle ORDER BY n DESC`, [...aP, from, to]);
  const faitsMarquants = await all(
    `SELECT a.date, a.description, at.libelle AS type
     FROM dsi_activities a LEFT JOIN dsi_activity_types at ON at.id=a.type_id
     WHERE a.fait_marquant = true AND a.date >= $${aP.length + 1} AND a.date < $${aP.length + 2} ${aE}
     ORDER BY a.date`, [...aP, from, to]);

  const prP = []; const prE = entClause('p.entity_id', entityId, prP);
  const projets = await all(
    `SELECT p.code, p.nom, TRIM(CONCAT(u.prenom,' ',u.nom)) AS responsable, p.avancement_pct, p.date_fin_prevue,
            p.budget_prevu, p.budget_consomme, p.statut
     FROM dsi_projects p LEFT JOIN users u ON u.id=p.responsable_id
     WHERE p.deleted_at IS NULL AND p.statut NOT IN ('annule') ${prE} ORDER BY p.statut, p.nom`, prP);
  const risques = await all(
    `SELECT r.reference, r.sujet, r.criticite, r.echeance, r.statut, TRIM(CONCAT(u.prenom,' ',u.nom)) AS responsable
     FROM dsi_risks r LEFT JOIN users u ON u.id=r.responsable_id
     WHERE r.criticite IN ('eleve','critique') AND r.statut<>'clos' ORDER BY CASE r.criticite WHEN 'critique' THEN 1 ELSE 2 END`);

  const delta = (a, b) => (a == null || b == null ? null : a - b);
  return {
    generatedAt: new Date().toISOString(),
    periode: { annee, mois, from, to },
    chiffres: cur,
    comparaison: {
      tickets_recus: delta(cur.tickets.recus, prev.tickets.recus),
      tickets_resolus: delta(cur.tickets.resolus, prev.tickets.resolus),
      sla_pct: delta(cur.tickets.sla_pct, prev.tickets.sla_pct),
      incidents_critiques: delta(cur.tickets.incidents_critiques, prev.tickets.incidents_critiques),
      prev: { recus: prev.tickets.recus, resolus: prev.tickets.resolus, sla_pct: prev.tickets.sla_pct },
    },
    listes: { incidentsMajeurs, ticketsParCategorie, activitesParType, faitsMarquants, projets, risques },
  };
}

const MONTHS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// Sections managériales éditables (vides par défaut ; le Responsable DSI les complète).
function emptySections() {
  return {
    synthese: { resume: '', realisations: '', difficultes: '', risques: '', attention: '', recommandations: '', decisions: '' },
    analyses: { sla: '', maintenance: '', securite: '' },
    recommandations: [],
  };
}

async function generate(user, { annee, mois, entityId }) {
  if (!annee || !mois) throw httpError(400, 'Année et mois requis.');
  const existing = await one('SELECT * FROM dsi_reports WHERE annee=$1 AND mois=$2 AND COALESCE(entity_id,0)=COALESCE($3,0)', [annee, mois, entityId || null]);
  if (existing && existing.verrouille) throw httpError(409, 'Ce rapport est validé et verrouillé.');
  const snapshot = await computeSnapshot(annee, mois, entityId || null);
  if (existing) {
    // Régénère les KPI mais conserve les sections managériales déjà saisies.
    const payload = { ...existing.payload, snapshot, sections: existing.payload?.sections || emptySections() };
    await run('UPDATE dsi_reports SET payload=$2, genere_le=now(), updated_at=now() WHERE id=$1', [existing.id, payload]);
    await audit.logAction({ tableName: 'dsi_reports', recordId: existing.id, action: 'dsi_report_regenerate', userId: user.id, details: { annee, mois } });
    return getById(existing.id);
  }
  const payload = { snapshot, sections: emptySections() };
  const row = await one(
    `INSERT INTO dsi_reports (annee, mois, entity_id, responsable_id, statut, genere_le, payload, created_by)
     VALUES ($1,$2,$3,$4,'brouillon',now(),$5,$6) RETURNING *`,
    [annee, mois, entityId || null, user.id, payload, user.id]);
  // Report automatique des actions non terminées du mois précédent.
  const prevM = mois === 1 ? 12 : mois - 1, prevY = mois === 1 ? annee - 1 : annee;
  const prevReport = await one('SELECT id FROM dsi_reports WHERE annee=$1 AND mois=$2 AND COALESCE(entity_id,0)=COALESCE($3,0)', [prevY, prevM, entityId || null]);
  if (prevReport) {
    await run(
      `INSERT INTO dsi_report_actions (report_id, libelle, responsable_id, echeance, priorite, statut, ordre)
       SELECT $1, libelle, responsable_id, echeance, priorite, statut, ordre FROM dsi_report_actions
       WHERE report_id=$2 AND statut<>'termine'`, [row.id, prevReport.id]);
  }
  await audit.logAction({ tableName: 'dsi_reports', recordId: row.id, action: 'dsi_report_generate', userId: user.id, details: { annee, mois } });
  return getById(row.id);
}

async function getById(id) {
  const r = await one(
    `SELECT r.*, TRIM(CONCAT(u.prenom,' ',u.nom)) AS responsable_nom, ent.code AS entity_code,
            TRIM(CONCAT(v.prenom,' ',v.nom)) AS valide_par_nom
     FROM dsi_reports r LEFT JOIN users u ON u.id=r.responsable_id LEFT JOIN entities ent ON ent.id=r.entity_id
     LEFT JOIN users v ON v.id=r.valide_par WHERE r.id=$1`, [id]);
  if (!r) return null;
  r.actions = await all('SELECT * FROM dsi_report_actions WHERE report_id=$1 ORDER BY ordre, id', [id]);
  return r;
}

async function list() {
  return all(
    `SELECT r.id, r.annee, r.mois, r.entity_id, ent.code AS entity_code, r.statut, r.genere_le, r.valide_le,
            TRIM(CONCAT(u.prenom,' ',u.nom)) AS responsable_nom
     FROM dsi_reports r LEFT JOIN users u ON u.id=r.responsable_id LEFT JOIN entities ent ON ent.id=r.entity_id
     ORDER BY r.annee DESC, r.mois DESC`);
}

async function assertEditable(id) {
  const r = await one('SELECT * FROM dsi_reports WHERE id=$1', [id]);
  if (!r) throw httpError(404, 'Rapport introuvable.');
  if (r.verrouille) throw httpError(409, 'Rapport validé et verrouillé.');
  return r;
}

async function updateSections(user, id, sections) {
  const r = await assertEditable(id);
  const payload = { ...r.payload, sections: { ...(r.payload?.sections || emptySections()), ...sections } };
  await run('UPDATE dsi_reports SET payload=$2, updated_at=now() WHERE id=$1', [id, payload]);
  return getById(id);
}

async function setStatut(user, id, statut) {
  const r = await one('SELECT * FROM dsi_reports WHERE id=$1', [id]);
  if (!r) throw httpError(404, 'Rapport introuvable.');
  if (statut === 'valide') {
    // Fige le snapshot à la validation (recalcul final) + verrouille.
    const snapshot = await computeSnapshot(r.annee, r.mois, r.entity_id);
    const payload = { ...r.payload, snapshot };
    await run('UPDATE dsi_reports SET statut=$2, payload=$3, verrouille=true, valide_le=now(), valide_par=$4, updated_at=now() WHERE id=$1', [id, statut, payload, user.id]);
    await audit.logAction({ tableName: 'dsi_reports', recordId: id, action: 'dsi_report_validate', userId: user.id, details: {} });
  } else if (statut === 'a_valider' || statut === 'diffuse') {
    if (r.verrouille && statut === 'a_valider') throw httpError(409, 'Rapport verrouillé.');
    await run('UPDATE dsi_reports SET statut=$2, updated_at=now() WHERE id=$1', [id, statut]);
    await audit.logAction({ tableName: 'dsi_reports', recordId: id, action: 'dsi_report_' + statut, userId: user.id, details: {} });
  } else if (statut === 'brouillon') { // réouverture
    await run('UPDATE dsi_reports SET statut=$2, verrouille=false, updated_at=now() WHERE id=$1', [id, statut]);
    await audit.logAction({ tableName: 'dsi_reports', recordId: id, action: 'dsi_report_reopen', userId: user.id, details: {} });
  } else throw httpError(400, 'Statut invalide.');
  return getById(id);
}

// Actions du plan d'action
async function addAction(user, id, body) {
  await assertEditable(id);
  return one(`INSERT INTO dsi_report_actions (report_id, libelle, responsable_id, echeance, priorite, statut)
    VALUES ($1,$2,$3,$4,$5,COALESCE($6,'a_faire')) RETURNING *`,
    [id, body.libelle, body.responsable_id || null, body.echeance || null, body.priorite || null, body.statut]);
}
async function deleteAction(user, actionId) {
  await run('DELETE FROM dsi_report_actions WHERE id=$1', [actionId]);
}

module.exports = { generate, getById, list, updateSections, setStatut, addAction, deleteAction, computeSnapshot, monthRange, MONTHS };
