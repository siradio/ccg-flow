const { one } = require('../../db');
const { hasAnyRoleOnEntity } = require('../../middleware/permissions');
const { httpError } = require('../../utils/httpError');
const auditService = require('../audit/audit.service');
const blob = require('../../storage/blob');

async function purchaseRequestEntity(prId) {
  const row = await one('SELECT entity_id FROM purchase_requests WHERE id = $1', [prId]);
  return row ? row.entity_id : null;
}

async function uploadForPurchaseRequest(user, prId, file) {
  const entityId = await purchaseRequestEntity(prId);
  if (!entityId) throw httpError(404, 'Demande introuvable.');
  if (!hasAnyRoleOnEntity(user, entityId)) throw httpError(403, "Vous n'avez aucun rôle sur cette entité.");

  const key = await blob.putBuffer(file.buffer, file.mimetype, 'attachments');
  const content = key ? null : file.buffer; // Blob si configuré, sinon BYTEA (dev local)
  const row = await one(
    `INSERT INTO attachments (purchase_request_id, filename, mimetype, content, content_key, taille, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, filename, mimetype, taille, uploaded_by, uploaded_at`,
    [prId, file.originalname, file.mimetype, content, key, file.size, user.id]
  );
  await auditService.logAction({ tableName: 'attachments', recordId: row.id, purchaseRequestId: prId, action: 'attachment_uploaded', userId: user.id, details: { filename: file.originalname } });
  return row;
}

// Pas de vérification de rôle ni de journal d'audit ici : appelée depuis
// purchase-requests.service.js#addQuote, qui a déjà validé le rôle service_achat et journalise
// lui-même (avec le purchase_request_id, pour que l'action apparaisse dans l'historique de la
// demande — un log rattaché seulement au quote_id n'y apparaîtrait pas, voir audit.service.js).
async function attachToQuote(quoteId, file, userId) {
  const key = await blob.putBuffer(file.buffer, file.mimetype, 'attachments');
  const content = key ? null : file.buffer;
  return one(
    `INSERT INTO attachments (quote_id, filename, mimetype, content, content_key, taille, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, filename, mimetype, taille, uploaded_by, uploaded_at`,
    [quoteId, file.originalname, file.mimetype, content, key, file.size, userId]
  );
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
  // Blob : on télécharge le binaire pour que la route serve `content` comme avant.
  if (attachment.content_key) attachment.content = await blob.getBuffer(attachment.content_key);
  return attachment;
}

module.exports = { uploadForPurchaseRequest, attachToQuote, download };
