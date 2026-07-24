const { all, one } = require('../../db');

async function logAction({ tableName, recordId, purchaseRequestId, action, userId, details }) {
  await one(
    `INSERT INTO audit_log (table_name, record_id, purchase_request_id, action, user_id, details)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [tableName, recordId, purchaseRequestId, action, userId || null, details ? JSON.stringify(details) : null]
  );
}

async function getHistory(purchaseRequestId) {
  return all(
    `SELECT a.*, u.nom AS user_nom, u.prenom AS user_prenom
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.purchase_request_id = $1
     ORDER BY a.created_at ASC, a.id ASC`,
    [purchaseRequestId]
  );
}

module.exports = { logAction, getHistory };
