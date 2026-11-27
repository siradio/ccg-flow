// Module QHSE — Volet Qualité (QUA-09). Évaluation des fournisseurs : qualification + évaluations
// périodiques, note globale + grille de critères (JSONB) + statut. Réutilise le référentiel suppliers.
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const TYPES = ['qualification', 'periodique'];
const STATUTS = ['en_cours', 'qualifie', 'sous_reserve', 'rejete'];

async function listEvaluations() {
  return all(
    `SELECT e.*, s.nom AS supplier_nom
       FROM qhse_supplier_evaluations e
       JOIN suppliers s ON s.id = e.supplier_id
      ORDER BY e.date_evaluation DESC NULLS LAST, e.id DESC`
  );
}

function clean(b) {
  const type = TYPES.includes(b.type) ? b.type : 'periodique';
  const statut = STATUTS.includes(b.statut) ? b.statut : 'en_cours';
  const criteria = Array.isArray(b.criteria) ? b.criteria : null;
  return {
    supplier_id: b.supplier_id ? Number(b.supplier_id) : null,
    date_evaluation: b.date_evaluation || null,
    type, statut,
    note: b.note === '' || b.note == null ? null : Number(b.note),
    note_max: b.note_max === '' || b.note_max == null ? null : Number(b.note_max),
    criteria: criteria ? JSON.stringify(criteria) : null,
    commentaire: b.commentaire || null,
  };
}

async function createEvaluation(user, b) {
  const c = clean(b);
  if (!c.supplier_id) throw httpError(400, 'Fournisseur requis.');
  return one(
    `INSERT INTO qhse_supplier_evaluations (supplier_id, date_evaluation, type, note, note_max, statut, criteria, commentaire, evaluated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [c.supplier_id, c.date_evaluation, c.type, c.note, c.note_max, c.statut, c.criteria, c.commentaire, user.id]
  );
}

async function updateEvaluation(user, id, b) {
  const c = clean(b);
  if (!c.supplier_id) throw httpError(400, 'Fournisseur requis.');
  const row = await one(
    `UPDATE qhse_supplier_evaluations SET supplier_id=$1, date_evaluation=$2, type=$3, note=$4, note_max=$5,
            statut=$6, criteria=$7, commentaire=$8, evaluated_by=$9, updated_at=now() WHERE id=$10 RETURNING *`,
    [c.supplier_id, c.date_evaluation, c.type, c.note, c.note_max, c.statut, c.criteria, c.commentaire, user.id, id]
  );
  if (!row) throw httpError(404, 'Évaluation introuvable.');
  return row;
}

async function removeEvaluation(id) { await run('DELETE FROM qhse_supplier_evaluations WHERE id = $1', [id]); }

module.exports = { listEvaluations, createEvaluation, updateEvaluation, removeEvaluation };
