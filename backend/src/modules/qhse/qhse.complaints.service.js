// Module QHSE — Volet Qualité (QUA-08). Réclamations et retours clients : fiche + investigation +
// réponse + actions de traitement + clôture. Lien facultatif vers une NC. Clôture manuelle (verrou).
const { all, one, run } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const STATUTS = ['ouverte', 'investigation', 'reponse', 'cloturee'];

async function listComplaints() {
  return all(
    `SELECT c.*, sv.libelle AS severity_libelle, p.designation AS product_nom, bu.nom AS bu_nom,
            (SELECT COUNT(*)::int FROM qhse_complaint_actions a WHERE a.complaint_id = c.id) AS nb_actions,
            (SELECT COUNT(*)::int FROM qhse_complaint_actions a WHERE a.complaint_id = c.id AND a.statut <> 'faite') AS nb_actions_ouvertes
       FROM qhse_complaints c
       LEFT JOIN qhse_nc_severities sv ON sv.id = c.severity_id
       LEFT JOIN products p ON p.id = c.product_id
       LEFT JOIN business_units bu ON bu.id = c.business_unit_id
      ORDER BY c.date_reclamation DESC NULLS LAST, c.id DESC`
  );
}

async function createComplaint(user, b) {
  const c = await one(
    `INSERT INTO qhse_complaints
       (date_reclamation, client, canal, type_reclamation, severity_id, business_unit_id, product_id,
        format_id, numero_lot, quantite_concernee, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [b.date_reclamation || null, b.client || null, b.canal || null, b.type_reclamation || null,
      b.severity_id || null, b.business_unit_id || null, b.product_id || null, b.format_id || null,
      b.numero_lot || null, b.quantite_concernee || null, b.description || null, user.id]
  );
  const numero = 'REC-' + String(c.id).padStart(5, '0');
  await run('UPDATE qhse_complaints SET numero = $1 WHERE id = $2', [numero, c.id]);
  return { ...c, numero };
}

async function getComplaintDetail(id) {
  const c = await one(
    `SELECT c.*, sv.libelle AS severity_libelle, p.designation AS product_nom, f.libelle AS format_libelle,
            bu.nom AS bu_nom, n.numero AS nc_numero
       FROM qhse_complaints c
       LEFT JOIN qhse_nc_severities sv ON sv.id = c.severity_id
       LEFT JOIN products p ON p.id = c.product_id
       LEFT JOIN qhse_formats f ON f.id = c.format_id
       LEFT JOIN business_units bu ON bu.id = c.business_unit_id
       LEFT JOIN qhse_nonconformities n ON n.id = c.nc_id
      WHERE c.id = $1`, [id]);
  if (!c) return null;
  const actions = await all('SELECT * FROM qhse_complaint_actions WHERE complaint_id = $1 ORDER BY ordre, id', [id]);
  return { ...c, actions };
}

async function updateComplaint(user, id, b) {
  const c = await one('SELECT statut FROM qhse_complaints WHERE id = $1', [id]);
  if (!c) throw httpError(404, 'Réclamation introuvable.');
  if (c.statut === 'cloturee') throw httpError(409, 'Réclamation clôturée : non modifiable.');
  const statut = b.statut && STATUTS.includes(b.statut) && b.statut !== 'cloturee' ? b.statut : c.statut;
  await run(
    `UPDATE qhse_complaints SET
       date_reclamation = $1, client = $2, canal = $3, type_reclamation = $4, severity_id = $5,
       business_unit_id = $6, product_id = $7, format_id = $8, numero_lot = $9, quantite_concernee = $10,
       description = $11, investigation = $12, reponse_client = $13, nc_id = $14, statut = $15, updated_at = now()
     WHERE id = $16`,
    [b.date_reclamation || null, b.client || null, b.canal || null, b.type_reclamation || null,
      b.severity_id || null, b.business_unit_id || null, b.product_id || null, b.format_id || null,
      b.numero_lot || null, b.quantite_concernee || null, b.description || null, b.investigation || null,
      b.reponse_client || null, b.nc_id || null, statut, id]
  );
  return getComplaintDetail(id);
}

async function saveActions(user, id, rows) {
  const c = await one('SELECT statut FROM qhse_complaints WHERE id = $1', [id]);
  if (!c) throw httpError(404, 'Réclamation introuvable.');
  if (c.statut === 'cloturee') throw httpError(409, 'Réclamation clôturée : non modifiable.');
  await run('DELETE FROM qhse_complaint_actions WHERE complaint_id = $1', [id]);
  let i = 0;
  for (const a of rows || []) {
    await run(
      `INSERT INTO qhse_complaint_actions (complaint_id, type_action, description, responsable, echeance, statut, date_realisation, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, a.type_action || null, a.description || null, a.responsable || null, a.echeance || null,
        a.statut || 'a_faire', a.date_realisation || null, i++]
    );
  }
  return getComplaintDetail(id);
}

async function closeComplaint(user, id) {
  const c = await one('SELECT statut FROM qhse_complaints WHERE id = $1', [id]);
  if (!c) throw httpError(404, 'Réclamation introuvable.');
  if (c.statut === 'cloturee') throw httpError(409, 'Réclamation déjà clôturée.');
  await run(`UPDATE qhse_complaints SET statut = 'cloturee', closed_by = $1, closed_at = now(), updated_at = now() WHERE id = $2`, [user.id, id]);
  return getComplaintDetail(id);
}

module.exports = { listComplaints, createComplaint, getComplaintDetail, updateComplaint, saveActions, closeComplaint };
