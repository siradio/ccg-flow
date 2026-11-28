// Module QHSE — Plan d'actions QHSE (registre transverse). CRUD + numérotation ACT-##### +
// synthèse (compteurs par statut, actions en retard). Une action « a_faire/en_cours » dont
// l'échéance est dépassée est signalée en retard (champ calculé en_retard).
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const ORIGINES = ['audit', 'reclamation', 'accident', 'inspection', 'non_conformite', 'revue_direction', 'reglementaire', 'autre'];
const TYPES = ['corrective', 'preventive', 'amelioration'];
const STATUTS = ['a_faire', 'en_cours', 'faite', 'annulee'];
const EFFICACITES = ['non_evaluee', 'efficace', 'inefficace'];
const today = () => new Date().toISOString().slice(0, 10);

function withFlags(a) {
  const enRetard = (a.statut === 'a_faire' || a.statut === 'en_cours') && a.echeance && String(a.echeance).slice(0, 10) < today();
  return { ...a, en_retard: !!enRetard };
}

async function listActions() {
  const rows = await all(
    `SELECT a.*, bu.nom AS bu_nom FROM qhse_actions a
       LEFT JOIN business_units bu ON bu.id = a.business_unit_id
      ORDER BY (a.statut IN ('faite','annulee')), a.echeance NULLS LAST, a.id DESC`
  );
  return rows.map(withFlags);
}

async function summary() {
  const rows = await all('SELECT statut, COUNT(*)::int AS n FROM qhse_actions GROUP BY statut');
  const parStatut = {};
  for (const r of rows) parStatut[r.statut] = r.n;
  const retard = await one(
    `SELECT COUNT(*)::int AS n FROM qhse_actions WHERE statut IN ('a_faire','en_cours') AND echeance IS NOT NULL AND echeance < $1`, [today()]);
  return { parStatut, enRetard: retard ? retard.n : 0 };
}

function sanitize(b) {
  return {
    origine: ORIGINES.includes(b.origine) ? b.origine : 'autre',
    reference_origine: b.reference_origine || null,
    domaine: b.domaine || null,
    business_unit_id: b.business_unit_id || null,
    type_action: TYPES.includes(b.type_action) ? b.type_action : 'corrective',
    description: b.description || null,
    responsable: b.responsable || null,
    echeance: b.echeance || null,
    statut: STATUTS.includes(b.statut) ? b.statut : 'a_faire',
    date_realisation: b.date_realisation || null,
    efficacite: EFFICACITES.includes(b.efficacite) ? b.efficacite : 'non_evaluee',
    observations: b.observations || null,
  };
}

async function createAction(user, b) {
  if (!b.description) throw httpError(400, 'Description requise.');
  const s = sanitize(b);
  const a = await one(
    `INSERT INTO qhse_actions (origine, reference_origine, domaine, business_unit_id, type_action,
            description, responsable, echeance, statut, date_realisation, efficacite, observations, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [s.origine, s.reference_origine, s.domaine, s.business_unit_id, s.type_action, s.description,
      s.responsable, s.echeance, s.statut, s.date_realisation, s.efficacite, s.observations, user.id]
  );
  const numero = 'ACT-' + String(a.id).padStart(5, '0');
  await run('UPDATE qhse_actions SET numero = $1 WHERE id = $2', [numero, a.id]);
  return withFlags({ ...a, numero });
}

async function updateAction(user, id, b) {
  const cur = await one('SELECT id FROM qhse_actions WHERE id = $1', [id]);
  if (!cur) throw httpError(404, 'Action introuvable.');
  const s = sanitize(b);
  await run(
    `UPDATE qhse_actions SET origine=$1, reference_origine=$2, domaine=$3, business_unit_id=$4, type_action=$5,
            description=$6, responsable=$7, echeance=$8, statut=$9, date_realisation=$10, efficacite=$11,
            observations=$12, updated_at=now() WHERE id=$13`,
    [s.origine, s.reference_origine, s.domaine, s.business_unit_id, s.type_action, s.description,
      s.responsable, s.echeance, s.statut, s.date_realisation, s.efficacite, s.observations, id]
  );
  return withFlags(await one('SELECT a.*, bu.nom AS bu_nom FROM qhse_actions a LEFT JOIN business_units bu ON bu.id = a.business_unit_id WHERE a.id = $1', [id]));
}

async function deleteAction(user, id) {
  const cur = await one('SELECT id FROM qhse_actions WHERE id = $1', [id]);
  if (!cur) throw httpError(404, 'Action introuvable.');
  await run('DELETE FROM qhse_actions WHERE id = $1', [id]);
  return { ok: true };
}

module.exports = { listActions, summary, createAction, updateAction, deleteAction };
