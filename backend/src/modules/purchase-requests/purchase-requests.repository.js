const { all, one, run } = require('../../db');

async function createDraft({ entityId, workflowTemplateId, requesterId, siteId, objet, justification, devise }) {
  return one(
    `INSERT INTO purchase_requests
       (numero, entity_id, workflow_template_id, requester_user_id, site_id, objet, justification, devise, status)
     VALUES ('PENDING', $1,$2,$3,$4,$5,$6,$7,'brouillon')
     RETURNING *`,
    [entityId, workflowTemplateId, requesterId, siteId || null, objet, justification || null, devise || 'GNF']
  );
}

async function setNumero(id, numero) {
  return one('UPDATE purchase_requests SET numero = $1 WHERE id = $2 RETURNING *', [numero, id]);
}

async function getById(id) {
  return one(
    `SELECT pr.*, e.code AS entity_code, e.nom AS entity_nom,
            u.nom AS requester_nom, u.prenom AS requester_prenom,
            cs.code AS current_step_code, cs.nom AS current_step_nom, cs.role_code_requis AS current_step_role
     FROM purchase_requests pr
     JOIN entities e ON e.id = pr.entity_id
     JOIN users u ON u.id = pr.requester_user_id
     LEFT JOIN workflow_steps cs ON cs.id = pr.current_step_id
     WHERE pr.id = $1`,
    [id]
  );
}

async function list({ entityId, status, requesterId }) {
  const clauses = [];
  const params = [];
  if (entityId) { params.push(entityId); clauses.push(`pr.entity_id = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`pr.status = $${params.length}`); }
  if (requesterId) { params.push(requesterId); clauses.push(`pr.requester_user_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(
    `SELECT pr.*, e.code AS entity_code, u.nom AS requester_nom, u.prenom AS requester_prenom
     FROM purchase_requests pr
     JOIN entities e ON e.id = pr.entity_id
     JOIN users u ON u.id = pr.requester_user_id
     ${where}
     ORDER BY pr.created_at DESC`,
    params
  );
}

async function updateStatusAndStep(id, status, currentStepId) {
  return one(
    'UPDATE purchase_requests SET status = $1, current_step_id = $2, updated_at = now() WHERE id = $3 RETURNING *',
    [status, currentStepId, id]
  );
}

async function setMontantFinal(id, montant, devise) {
  return one('UPDATE purchase_requests SET montant_final = $1, devise = $2, updated_at = now() WHERE id = $3 RETURNING *', [montant, devise, id]);
}

// ─── Lignes ──────────────────────────────────────────────────────────────

async function addLine(prId, { productId, descriptionLibre, quantite, unite, prixUnitaireEstime }) {
  return one(
    `INSERT INTO purchase_request_lines (purchase_request_id, product_id, description_libre, quantite, unite, prix_unitaire_estime)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [prId, productId || null, descriptionLibre || null, quantite, unite || null, prixUnitaireEstime || null]
  );
}

async function getLines(prId) {
  return all(
    `SELECT l.*, p.designation FROM purchase_request_lines l
     LEFT JOIN products p ON p.id = l.product_id
     WHERE l.purchase_request_id = $1 ORDER BY l.id`,
    [prId]
  );
}

async function getLine(id) {
  return one('SELECT * FROM purchase_request_lines WHERE id = $1', [id]);
}

async function updateLine(id, fields) {
  const existing = await getLine(id);
  if (!existing) return null;
  return one(
    `UPDATE purchase_request_lines SET
       product_id = $1, description_libre = $2, quantite = $3, unite = $4, prix_unitaire_estime = $5
     WHERE id = $6 RETURNING *`,
    [
      fields.productId ?? existing.product_id,
      fields.descriptionLibre ?? existing.description_libre,
      fields.quantite ?? existing.quantite,
      fields.unite ?? existing.unite,
      fields.prixUnitaireEstime ?? existing.prix_unitaire_estime,
      id,
    ]
  );
}

async function deleteLine(id) {
  await run('DELETE FROM purchase_request_lines WHERE id = $1', [id]);
}

async function setLinesFournisseurRetenu(prId, supplierId) {
  await run('UPDATE purchase_request_lines SET fournisseur_retenu_id = $1 WHERE purchase_request_id = $2', [supplierId, prId]);
}

// ─── Demandes de devis ───────────────────────────────────────────────────

async function createQuoteRequest(prId, userId, message) {
  return one(
    'INSERT INTO quote_requests (purchase_request_id, created_by, message) VALUES ($1,$2,$3) RETURNING *',
    [prId, userId, message || null]
  );
}

async function addQuoteRequestSupplier(quoteRequestId, supplierId) {
  return one(
    'INSERT INTO quote_request_suppliers (quote_request_id, supplier_id) VALUES ($1,$2) RETURNING *',
    [quoteRequestId, supplierId]
  );
}

async function getQuoteRequest(id) {
  return one('SELECT * FROM quote_requests WHERE id = $1', [id]);
}

async function getQuoteRequestSuppliers(quoteRequestId) {
  return all(
    `SELECT qrs.*, s.nom AS supplier_nom, s.contact_email AS supplier_email
     FROM quote_request_suppliers qrs JOIN suppliers s ON s.id = qrs.supplier_id
     WHERE qrs.quote_request_id = $1`,
    [quoteRequestId]
  );
}

async function getQuoteRequestSupplier(id) {
  return one(
    `SELECT qrs.*, s.nom AS supplier_nom, s.contact_email AS supplier_email
     FROM quote_request_suppliers qrs JOIN suppliers s ON s.id = qrs.supplier_id
     WHERE qrs.id = $1`,
    [id]
  );
}

async function markQuoteRequestSupplierSent(id) {
  return one("UPDATE quote_request_suppliers SET statut = 'envoye', sent_at = now() WHERE id = $1 RETURNING *", [id]);
}

async function getQuoteRequestsForPR(prId) {
  return all('SELECT * FROM quote_requests WHERE purchase_request_id = $1 ORDER BY created_at', [prId]);
}

// ─── Devis reçus ─────────────────────────────────────────────────────────

async function createQuote(quoteRequestSupplierId, montant, devise, notes) {
  await run("UPDATE quote_request_suppliers SET statut = 'devis_recu' WHERE id = $1", [quoteRequestSupplierId]);
  return one(
    'INSERT INTO quotes (quote_request_supplier_id, montant, devise, notes) VALUES ($1,$2,$3,$4) RETURNING *',
    [quoteRequestSupplierId, montant, devise, notes || null]
  );
}

async function getQuote(id) {
  return one(
    `SELECT q.*, qrs.quote_request_id, qrs.supplier_id, s.nom AS supplier_nom
     FROM quotes q
     JOIN quote_request_suppliers qrs ON qrs.id = q.quote_request_supplier_id
     JOIN suppliers s ON s.id = qrs.supplier_id
     WHERE q.id = $1`,
    [id]
  );
}

async function getQuotesForPR(prId) {
  return all(
    `SELECT q.*, qrs.supplier_id, s.nom AS supplier_nom
     FROM quotes q
     JOIN quote_request_suppliers qrs ON qrs.id = q.quote_request_supplier_id
     JOIN quote_requests qr ON qr.id = qrs.quote_request_id
     JOIN suppliers s ON s.id = qrs.supplier_id
     WHERE qr.purchase_request_id = $1
     ORDER BY q.recu_le`,
    [prId]
  );
}

async function getAttachments(prId) {
  return all(
    `SELECT id, filename, mimetype, taille, uploaded_by, uploaded_at
     FROM attachments WHERE purchase_request_id = $1 ORDER BY uploaded_at`,
    [prId]
  );
}

async function selectQuote(quoteId, prId) {
  // Un seul devis sélectionné pour toute la demande.
  await run(
    `UPDATE quotes SET selectionne = false
     WHERE quote_request_supplier_id IN (
       SELECT qrs.id FROM quote_request_suppliers qrs
       JOIN quote_requests qr ON qr.id = qrs.quote_request_id
       WHERE qr.purchase_request_id = $1
     )`,
    [prId]
  );
  return one('UPDATE quotes SET selectionne = true WHERE id = $1 RETURNING *', [quoteId]);
}

// ─── Validations (approvals) ─────────────────────────────────────────────

async function createApproval(prId, workflowStepId) {
  return one(
    "INSERT INTO approvals (purchase_request_id, workflow_step_id, statut) VALUES ($1,$2,'en_attente') RETURNING *",
    [prId, workflowStepId]
  );
}

async function getPendingApproval(prId, workflowStepId) {
  return one(
    "SELECT * FROM approvals WHERE purchase_request_id = $1 AND workflow_step_id = $2 AND statut = 'en_attente' ORDER BY id DESC LIMIT 1",
    [prId, workflowStepId]
  );
}

async function decideApproval(approvalId, statut, userId, commentaire) {
  return one(
    'UPDATE approvals SET statut = $1, validated_by = $2, commentaire = $3, decided_at = now() WHERE id = $4 RETURNING *',
    [statut, userId, commentaire || null, approvalId]
  );
}

async function getApprovalsForPR(prId) {
  return all(
    `SELECT a.*, ws.code AS step_code, ws.nom AS step_nom, u.nom AS validated_by_nom, u.prenom AS validated_by_prenom
     FROM approvals a
     JOIN workflow_steps ws ON ws.id = a.workflow_step_id
     LEFT JOIN users u ON u.id = a.validated_by
     WHERE a.purchase_request_id = $1
     ORDER BY a.id`,
    [prId]
  );
}

module.exports = {
  createDraft, setNumero, getById, list, updateStatusAndStep, setMontantFinal,
  addLine, getLines, getLine, updateLine, deleteLine, setLinesFournisseurRetenu,
  createQuoteRequest, addQuoteRequestSupplier, getQuoteRequest, getQuoteRequestSuppliers,
  getQuoteRequestSupplier, markQuoteRequestSupplierSent, getQuoteRequestsForPR,
  createQuote, getQuote, getQuotesForPR, selectQuote, getAttachments,
  createApproval, getPendingApproval, decideApproval, getApprovalsForPR,
};
