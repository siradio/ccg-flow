// Module QHSE — Volet Hygiène. Inspections génériques : en-tête + relevé des critères du type +
// conformité calculée par le moteur commun. Clôture verrouillante.
const { all, one, run } = require('../../db');
const { criteriaConformite, conformiteGlobale } = require('./qhse.conformite');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

async function listInspections() {
  return all(
    `SELECT i.*, it.libelle AS type_libelle, bu.nom AS bu_nom
       FROM qhse_inspections i
       LEFT JOIN qhse_inspection_types it ON it.id = i.inspection_type_id
       LEFT JOIN business_units bu ON bu.id = i.business_unit_id
      ORDER BY i.date_inspection DESC NULLS LAST, i.id DESC`
  );
}

async function createInspection(user, b) {
  if (!b.inspection_type_id) throw httpError(400, 'Type d\'inspection requis.');
  return one(
    `INSERT INTO qhse_inspections (date_inspection, inspection_type_id, zone, business_unit_id, responsable, commentaire, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.date_inspection || null, Number(b.inspection_type_id), b.zone || null, b.business_unit_id || null,
      b.responsable || null, b.commentaire || null, user.id]
  );
}

async function getInspectionDetail(id) {
  const i = await one(
    `SELECT i.*, it.libelle AS type_libelle, bu.nom AS bu_nom
       FROM qhse_inspections i
       LEFT JOIN qhse_inspection_types it ON it.id = i.inspection_type_id
       LEFT JOIN business_units bu ON bu.id = i.business_unit_id
      WHERE i.id = $1`, [id]);
  if (!i) return null;
  const criteria = await all('SELECT * FROM qhse_inspection_criteria WHERE inspection_type_id = $1 AND actif = true ORDER BY ordre, id', [i.inspection_type_id]);
  const results = await all('SELECT * FROM qhse_inspection_results WHERE inspection_id = $1', [id]);
  return { ...i, criteria, results };
}

async function updateInspection(user, id, b) {
  const i = await one('SELECT statut FROM qhse_inspections WHERE id = $1', [id]);
  if (!i) throw httpError(404, 'Inspection introuvable.');
  if (i.statut === 'cloture') throw httpError(409, 'Inspection clôturée : non modifiable.');
  await run(
    `UPDATE qhse_inspections SET date_inspection=$1, zone=$2, business_unit_id=$3, responsable=$4, commentaire=$5, updated_at=now() WHERE id=$6`,
    [b.date_inspection || null, b.zone || null, b.business_unit_id || null, b.responsable || null, b.commentaire || null, id]
  );
  return getInspectionDetail(id);
}

// Enregistre les relevés (un par critère) et recalcule la conformité globale.
async function saveResults(user, id, rows) {
  const i = await one('SELECT statut, inspection_type_id FROM qhse_inspections WHERE id = $1', [id]);
  if (!i) throw httpError(404, 'Inspection introuvable.');
  if (i.statut === 'cloture') throw httpError(409, 'Inspection clôturée : non modifiable.');
  const criteria = await all('SELECT * FROM qhse_inspection_criteria WHERE inspection_type_id = $1', [i.inspection_type_id]);
  const byId = new Map(criteria.map(c => [c.id, c]));
  await run('DELETE FROM qhse_inspection_results WHERE inspection_id = $1', [id]);
  const conformites = [];
  for (const r of rows || []) {
    const crit = byId.get(Number(r.criteria_id));
    if (!crit) continue;
    const vb = r.valeur_bool === '' || r.valeur_bool == null ? null : !!r.valeur_bool;
    const vn = r.valeur_num === '' || r.valeur_num == null ? null : Number(r.valeur_num);
    const conf = criteriaConformite({ valeur_bool: vb, valeur_num: vn }, crit);
    conformites.push(conf);
    await run('INSERT INTO qhse_inspection_results (inspection_id, criteria_id, valeur_bool, valeur_num, conformite, commentaire) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, crit.id, vb, vn, conf, r.commentaire || null]);
  }
  await run('UPDATE qhse_inspections SET conformite = $1, updated_at = now() WHERE id = $2', [conformiteGlobale(conformites), id]);
  return getInspectionDetail(id);
}

async function closeInspection(user, id) {
  const i = await one('SELECT statut FROM qhse_inspections WHERE id = $1', [id]);
  if (!i) throw httpError(404, 'Inspection introuvable.');
  if (i.statut === 'cloture') throw httpError(409, 'Inspection déjà clôturée.');
  await run(`UPDATE qhse_inspections SET statut='cloture', closed_by=$1, closed_at=now(), updated_at=now() WHERE id=$2`, [user.id, id]);
  return getInspectionDetail(id);
}

module.exports = { listInspections, createInspection, getInspectionDetail, updateInspection, saveResults, closeInspection };
