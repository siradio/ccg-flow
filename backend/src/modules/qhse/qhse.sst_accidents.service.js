// Module QHSE — Volet SST (SST-03). Accidents / incidents / presque-accidents : fiche + enquête +
// actions + clôture (verrou). Pas de données médicales individuelles.
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const STATUTS = ['declare', 'enquete', 'cloture'];

async function listAccidents() {
  return all(
    `SELECT a.*, bu.nom AS bu_nom,
            (SELECT COUNT(*)::int FROM qhse_sst_accident_actions x WHERE x.accident_id = a.id AND x.statut <> 'faite') AS nb_actions_ouvertes
       FROM qhse_sst_accidents a LEFT JOIN business_units bu ON bu.id = a.business_unit_id
      ORDER BY a.date_evenement DESC NULLS LAST, a.id DESC`
  );
}

async function createAccident(user, b) {
  const a = await one(
    `INSERT INTO qhse_sst_accidents (date_evenement, type_evenement, business_unit_id, unite_travail, lieu, description, jours_perdus, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.date_evenement || null, b.type_evenement || 'presque_accident', b.business_unit_id || null,
      b.unite_travail || null, b.lieu || null, b.description || null,
      b.jours_perdus === '' || b.jours_perdus == null ? null : Number(b.jours_perdus), user.id]
  );
  const numero = 'SST-' + String(a.id).padStart(5, '0');
  await run('UPDATE qhse_sst_accidents SET numero = $1 WHERE id = $2', [numero, a.id]);
  return { ...a, numero };
}

async function getAccidentDetail(id) {
  const a = await one(`SELECT a.*, bu.nom AS bu_nom FROM qhse_sst_accidents a LEFT JOIN business_units bu ON bu.id = a.business_unit_id WHERE a.id = $1`, [id]);
  if (!a) return null;
  const actions = await all('SELECT * FROM qhse_sst_accident_actions WHERE accident_id = $1 ORDER BY ordre, id', [id]);
  return { ...a, actions };
}

async function updateAccident(user, id, b) {
  const a = await one('SELECT statut FROM qhse_sst_accidents WHERE id = $1', [id]);
  if (!a) throw httpError(404, 'Événement introuvable.');
  if (a.statut === 'cloture') throw httpError(409, 'Événement clôturé : non modifiable.');
  const statut = b.statut && STATUTS.includes(b.statut) && b.statut !== 'cloture' ? b.statut : a.statut;
  await run(
    `UPDATE qhse_sst_accidents SET date_evenement=$1, type_evenement=$2, business_unit_id=$3, unite_travail=$4,
            lieu=$5, description=$6, jours_perdus=$7, enquete=$8, causes=$9, statut=$10, updated_at=now() WHERE id=$11`,
    [b.date_evenement || null, b.type_evenement || 'presque_accident', b.business_unit_id || null, b.unite_travail || null,
      b.lieu || null, b.description || null, b.jours_perdus === '' || b.jours_perdus == null ? null : Number(b.jours_perdus),
      b.enquete || null, b.causes || null, statut, id]
  );
  return getAccidentDetail(id);
}

async function saveActions(user, id, rows) {
  const a = await one('SELECT statut FROM qhse_sst_accidents WHERE id = $1', [id]);
  if (!a) throw httpError(404, 'Événement introuvable.');
  if (a.statut === 'cloture') throw httpError(409, 'Événement clôturé : non modifiable.');
  await run('DELETE FROM qhse_sst_accident_actions WHERE accident_id = $1', [id]);
  let i = 0;
  for (const x of rows || []) {
    await run(
      `INSERT INTO qhse_sst_accident_actions (accident_id, type_action, description, responsable, echeance, statut, date_realisation, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, x.type_action || null, x.description || null, x.responsable || null, x.echeance || null,
        x.statut || 'a_faire', x.date_realisation || null, i++]
    );
  }
  return getAccidentDetail(id);
}

async function closeAccident(user, id) {
  const a = await one('SELECT statut FROM qhse_sst_accidents WHERE id = $1', [id]);
  if (!a) throw httpError(404, 'Événement introuvable.');
  if (a.statut === 'cloture') throw httpError(409, 'Événement déjà clôturé.');
  await run(`UPDATE qhse_sst_accidents SET statut='cloture', closed_by=$1, closed_at=now(), updated_at=now() WHERE id=$2`, [user.id, id]);
  return getAccidentDetail(id);
}

module.exports = { listAccidents, createAccident, getAccidentDetail, updateAccident, saveActions, closeAccident };
