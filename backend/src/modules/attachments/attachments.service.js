const { one } = require('../../db');
const { hasAnyRoleOnEntity } = require('../../middleware/permissions');
const { httpError } = require('../../utils/httpError');
const auditService = require('../audit/audit.service');

async function purchaseRequestEntity(prId) {
  const row = await one('SELECT entity_id FROM purchase_requests WHERE id = $1', [prId]);
  return row ? row.entity_id : null;
}

async function uploadForPurchaseRequest(user, prId, file) {
  const entityId = await purchaseRequestEntity(prId);
  if (!entityId) throw httpError(404, 'Demande introuvable.');
  if (!hasAnyRoleOnEntity(user, entityId)) throw httpError(403, "Vous n'avez aucun rôle sur cette entité.");

  const row = await one(
    `INSERT INTO attachments (purchase_request_id, filename, mimetype, content, taille, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, filename, mimetype, taille, uploaded_by, uploaded_at`,
    [prId, file.originalname, file.mimetype, file.buffer, file.size, user.id]
  );
  await auditService.logAction({ tableName: 'attachments', recordId: row.id, purchaseRequestId: prId, action: 'attachment_uploaded', userId: user.id, details: { filename: file.originalname } });
  return row;
}

// Résout l'entity_id derrière une pièce jointe, qu'elle soit rattachée à une demande, un devis ou un BC.
async function getEntityIdForAttachment(attachment) {
  if (attachment.purchase_request_id) {
    return purchaseRequestEntity(attachment.purchase_request_id);
  }
  if (attachment.quote_id) {
    const row = await one(
      `SELECT pr.entity_id FROM quotes q
       JOIN quote_request_suppliers qrs ON qrs.id = q.quote_request_supplier_id
       JOIN quote_requests qr ON qr.id = qrs.quote_request_id
       JOIN purchase_requests pr ON pr.id = qr.purchase_request_id
       WHERE q.id = $1`,
      [attachment.quote_id]
    );
    return row ? row.entity_id : null;
  }
  if (attachment.purchase_order_id) {
    const row = await one(
      `SELECT pr.entity_id FROM purchase_orders po
       JOIN purchase_requests pr ON pr.id = po.purchase_request_id
       WHERE po.id = $1`,
      [attachment.purchase_order_id]
    );
    return row ? row.entity_id : null;
  }
  return null;
}

async function download(user, attachmentId) {
  const attachment = await one('SELECT * FROM attachments WHERE id = $1', [attachmentId]);
  if (!attachment) throw httpError(404, 'Pièce jointe introuvable.');
  const entityId = await getEntityIdForAttachment(attachment);
  if (!entityId || !hasAnyRoleOnEntity(user, entityId)) {
    throw httpError(403, "Vous n'avez pas accès à cette pièce jointe.");
  }
  return attachment;
}

module.exports = { uploadForPurchaseRequest, download };
