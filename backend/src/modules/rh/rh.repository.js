const { all, one, run } = require('../../db');

// Sélection enrichie d'une demande RH (avec noms lisibles).
const BASE_SELECT = `
  SELECT r.*, e.code AS entity_code, e.nom AS entity_nom, bu.nom AS business_unit_nom,
         emp.matricule AS employee_matricule, emp.prenom AS employee_prenom, emp.nom AS employee_nom,
         emp.poste AS employee_poste, emp.departement AS employee_departement,
         t.libelle AS type_libelle, t.domaine AS type_domaine,
         u.prenom AS created_by_prenom, u.nom AS created_by_nom
  FROM rh_requests r
  JOIN entities e ON e.id = r.entity_id
  LEFT JOIN business_units bu ON bu.id = r.business_unit_id
  LEFT JOIN employees emp ON emp.id = r.employee_id
  LEFT JOIN rh_types t ON t.id = r.type_id
  LEFT JOIN users u ON u.id = r.created_by`;

async function create(row) {
  const r = await one(
    `INSERT INTO rh_requests (type, employee_id, created_by, entity_id, business_unit_id, statut,
        type_id, date_debut, date_fin, jours, motif, commentaire, payload)
     VALUES ($1,$2,$3,$4,$5,'brouillon',$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [row.type, row.employeeId, row.createdBy, row.entityId, row.businessUnitId || null,
     row.typeId || null, row.dateDebut || null, row.dateFin || null, row.jours || null,
     row.motif || null, row.commentaire || null, row.payload || null]
  );
  return r;
}

async function setNumero(id, numero) {
  return one('UPDATE rh_requests SET numero = $1 WHERE id = $2 RETURNING *', [numero, id]);
}

async function getById(id) {
  return one(`${BASE_SELECT} WHERE r.id = $1`, [id]);
}

async function update(id, fields) {
  const cols = Object.keys(fields);
  if (!cols.length) return getById(id);
  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const params = cols.map(c => fields[c]);
  params.push(id);
  await run(`UPDATE rh_requests SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
  return getById(id);
}

async function listMine(userId) {
  return all(`${BASE_SELECT} WHERE r.created_by = $1 ORDER BY r.created_at DESC`, [userId]);
}

// Demandes en attente d'action pour l'utilisateur : en_validation + rôle courant détenu sur l'entité.
async function listPending(roleEntityPairs) {
  if (!roleEntityPairs.length) return [];
  const clauses = [];
  const params = [];
  for (const { roleCode, entityId } of roleEntityPairs) {
    params.push(entityId, roleCode);
    clauses.push(`(r.entity_id = $${params.length - 1} AND r.role_courant = $${params.length})`);
  }
  return all(`${BASE_SELECT} WHERE r.statut = 'en_validation' AND (${clauses.join(' OR ')}) ORDER BY r.created_at DESC`, params);
}

// Toutes les demandes des entités où l'utilisateur détient un rôle RH (ou tout, si entityIds = null pour super_admin).
async function listAll(entityIds) {
  if (entityIds === null) return all(`${BASE_SELECT} ORDER BY r.created_at DESC`, []);
  if (!entityIds.length) return [];
  return all(`${BASE_SELECT} WHERE r.entity_id = ANY($1) ORDER BY r.created_at DESC`, [entityIds]);
}

// ─── Historique ───────────────────────────────────────────────────────────
async function logHistory(rhRequestId, action, userId, commentaire) {
  await run('INSERT INTO rh_request_history (rh_request_id, action, user_id, commentaire) VALUES ($1,$2,$3,$4)',
    [rhRequestId, action, userId, commentaire || null]);
}
async function getHistory(rhRequestId) {
  return all(
    `SELECT h.*, u.prenom AS user_prenom, u.nom AS user_nom
     FROM rh_request_history h LEFT JOIN users u ON u.id = h.user_id
     WHERE h.rh_request_id = $1 ORDER BY h.created_at ASC, h.id ASC`, [rhRequestId]);
}

// ─── Pièces jointes ─────────────────────────────────────────────────────────
async function addAttachment({ rhRequestId, filename, mime, taille, content, contentKey, uploadedBy }) {
  return one(
    `INSERT INTO rh_attachments (rh_request_id, filename, mime, taille, content, content_key, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, filename, mime, taille, uploaded_at`,
    [rhRequestId, filename, mime, taille, content, contentKey, uploadedBy]);
}
async function getAttachments(rhRequestId) {
  return all('SELECT id, filename, mime, taille, uploaded_at FROM rh_attachments WHERE rh_request_id = $1 ORDER BY uploaded_at', [rhRequestId]);
}
async function getAttachment(id) {
  return one('SELECT * FROM rh_attachments WHERE id = $1', [id]);
}
async function deleteAttachment(id) {
  await run('DELETE FROM rh_attachments WHERE id = $1', [id]);
}

// Jours fériés dans une plage (pour le calcul des jours ouvrables).
async function holidaysBetween(from, to) {
  return all('SELECT date FROM rh_jours_feries WHERE date BETWEEN $1 AND $2', [from, to]);
}

module.exports = {
  create, setNumero, getById, update, listMine, listPending, listAll,
  logHistory, getHistory, addAttachment, getAttachments, getAttachment, deleteAttachment, holidaysBetween,
};
