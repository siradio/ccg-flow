const { all, one, run } = require('../../db');

async function createDraft({ entityId, workflowTemplateId, requesterId, siteId, objet, justification, devise, businessUnitId }) {
  return one(
    `INSERT INTO purchase_requests
       (numero, entity_id, business_unit_id, workflow_template_id, requester_user_id, site_id, objet, justification, devise, status)
     VALUES ('PENDING', $1,$2,$3,$4,$5,$6,$7,$8,'brouillon')
     RETURNING *`,
    [entityId, businessUnitId || null, workflowTemplateId, requesterId, siteId || null, objet, justification || null, devise || 'GNF']
  );
}

async function setNumero(id, numero) {
  return one('UPDATE purchase_requests SET numero = $1 WHERE id = $2 RETURNING *', [numero, id]);
}

async function getById(id) {
  return one(
    `SELECT pr.*, e.code AS entity_code, e.nom AS entity_nom, bu.nom AS business_unit_nom,
            u.nom AS requester_nom, u.prenom AS requester_prenom,
            cs.code AS current_step_code, cs.nom AS current_step_nom, cs.role_code_requis AS current_step_role
     FROM purchase_requests pr
     JOIN entities e ON e.id = pr.entity_id
     JOIN users u ON u.id = pr.requester_user_id
     LEFT JOIN business_units bu ON bu.id = pr.business_unit_id
     LEFT JOIN workflow_steps cs ON cs.id = pr.current_step_id
     WHERE pr.id = $1`,
    [id]
  );
}

// `COUNT(*) OVER()` renvoie le total (avant LIMIT) sur chaque ligne, pour paginer sans un
// second aller-retour — évite qu'une liste grossisse indéfiniment sans borne au fil du temps.
function toPage(rows, page, pageSize) {
  const total = rows.length ? Number(rows[0].total_count) : 0;
  return { items: rows.map(({ total_count, ...r }) => r), total, page, pageSize };
}

async function list({ entityId, status, requesterId }, { page = 1, pageSize = 20 } = {}) {
  const clauses = [];
  const params = [];
  if (entityId) { params.push(entityId); clauses.push(`pr.entity_id = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`pr.status = $${params.length}`); }
  if (requesterId) { params.push(requesterId); clauses.push(`pr.requester_user_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await all(
    `SELECT pr.*, e.code AS entity_code, u.nom AS requester_nom, u.prenom AS requester_prenom,
            COUNT(*) OVER() AS total_count
     FROM purchase_requests pr
     JOIN entities e ON e.id = pr.entity_id
     JOIN users u ON u.id = pr.requester_user_id
     ${where}
     ORDER BY pr.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return toPage(rows, page, pageSize);
}

// Demandes attendant concrètement une action de l'utilisateur, selon les rôles de
// validation qu'il détient (par entité) — même logique que dashboard.service.js.
async function listPendingAction(roleEntityPairs, { page = 1, pageSize = 20 } = {}) {
  if (!roleEntityPairs || roleEntityPairs.length === 0) return toPage([], page, pageSize);
  const clauses = [];
  const params = [];
  for (const { roleCode, entityId } of roleEntityPairs) {
    if (roleCode === 'service_achat') {
      params.push(entityId);
      clauses.push(`(pr.entity_id = $${params.length} AND pr.status IN ('soumise', 'en_analyse_achat', 'devis_en_cours', 'devis_selectionne'))`);
    } else if (roleCode === 'validateur_besoin') {
      // Un validateur_besoin a deux points d'action possibles : l'expression de besoin en amont
      // (nouveau statut, pas piloté par current_step_id) et, si elle existe encore dans le circuit
      // configuré, l'étape de validation finale — voir submit()/validateStep().
      params.push(entityId, roleCode);
      clauses.push(`(pr.entity_id = $${params.length - 1} AND (pr.status = 'en_attente_validation_besoin' OR pr.status = 'en_validation_dga' OR (pr.status = 'en_validation' AND ws.role_code_requis = $${params.length})))`);
    } else {
      params.push(entityId, roleCode);
      clauses.push(`(pr.entity_id = $${params.length - 1} AND pr.status = 'en_validation' AND ws.role_code_requis = $${params.length})`);
    }
  }
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await all(
    `SELECT pr.*, e.code AS entity_code, u.nom AS requester_nom, u.prenom AS requester_prenom,
            COUNT(*) OVER() AS total_count
     FROM purchase_requests pr
     JOIN entities e ON e.id = pr.entity_id
     JOIN users u ON u.id = pr.requester_user_id
     LEFT JOIN workflow_steps ws ON ws.id = pr.current_step_id
     WHERE ${clauses.join(' OR ')}
     ORDER BY pr.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return toPage(rows, page, pageSize);
}

// Visibilité par défaut (aucun filtre mine/entityId explicite) : mes propres demandes,
// où que ce soit, PLUS toutes les demandes des entités où l'utilisateur détient un rôle
// de validation (entityIds ne contient que ces entités-là, jamais les entités "demandeur seul").
async function listVisibleTo({ status, requesterId, entityIds }, { page = 1, pageSize = 20 } = {}) {
  const params = [requesterId];
  let visibilityClause = `pr.requester_user_id = $1`;
  if (entityIds && entityIds.length > 0) {
    params.push(entityIds);
    visibilityClause = `(${visibilityClause} OR pr.entity_id = ANY($${params.length}))`;
  }
  const clauses = [visibilityClause];
  if (status) { params.push(status); clauses.push(`pr.status = $${params.length}`); }
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await all(
    `SELECT pr.*, e.code AS entity_code, u.nom AS requester_nom, u.prenom AS requester_prenom,
            COUNT(*) OVER() AS total_count
     FROM purchase_requests pr
     JOIN entities e ON e.id = pr.entity_id
     JOIN users u ON u.id = pr.requester_user_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY pr.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return toPage(rows, page, pageSize);
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

// Le devis retenu ne porte qu'un montant global par fournisseur (table `quotes`, pas de détail
// ligne par ligne côté fournisseur) : on répartit ce montant sur les lignes au prorata de leur
// estimation initiale (prix_unitaire_estime * quantite), ou à parts égales par quantité si aucune
// estimation n'existe. Résultat : prix_unitaire_final toujours renseigné après sélection d'un
// devis, et la somme des montants de ligne correspond exactement au montant du devis retenu.
async function setLinesPrixUnitaireFinal(prId, montantTotal) {
  const lines = await getLines(prId);
  if (lines.length === 0) return;

  const poidsEstimes = lines.map(l => Number(l.prix_unitaire_estime || 0) * Number(l.quantite));
  const sommePoids = poidsEstimes.reduce((a, b) => a + b, 0);
  const sommeQuantites = lines.reduce((a, l) => a + Number(l.quantite), 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const quantite = Number(line.quantite);
    let montantLigne;
    if (sommePoids > 0) {
      montantLigne = montantTotal * (poidsEstimes[i] / sommePoids);
    } else {
      montantLigne = montantTotal * (quantite / sommeQuantites);
    }
    const prixUnitaire = quantite > 0 ? montantLigne / quantite : 0;
    await run('UPDATE purchase_request_lines SET prix_unitaire_final = $1 WHERE id = $2', [prixUnitaire, line.id]);
  }
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

// Prix par ligne d'un devis (nouveau modèle : un prix unitaire par article de la demande).
async function createQuoteLines(quoteId, rows) {
  for (const r of rows) {
    await run(
      `INSERT INTO quote_lines (quote_id, purchase_request_line_id, prix_unitaire) VALUES ($1,$2,$3)
       ON CONFLICT (quote_id, purchase_request_line_id) DO UPDATE SET prix_unitaire = EXCLUDED.prix_unitaire`,
      [quoteId, r.lineId, r.prixUnitaire]
    );
  }
}

async function getQuoteLines(quoteId) {
  return all('SELECT purchase_request_line_id, prix_unitaire FROM quote_lines WHERE quote_id = $1', [quoteId]);
}

// Applique les prix par ligne du devis retenu sur les lignes de la demande (prix_unitaire_final)
// et renvoie le montant final = somme(quantité × prix unitaire).
async function applyQuoteLinesToPrLines(prId, quoteLines) {
  const lines = await getLines(prId);
  const priceByLine = new Map(quoteLines.map(q => [Number(q.purchase_request_line_id), Number(q.prix_unitaire)]));
  let total = 0;
  for (const line of lines) {
    const pu = priceByLine.has(line.id) ? priceByLine.get(line.id) : 0;
    total += pu * Number(line.quantite);
    await run('UPDATE purchase_request_lines SET prix_unitaire_final = $1 WHERE id = $2', [pu, line.id]);
  }
  return total;
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
    `SELECT q.*, qrs.supplier_id, s.nom AS supplier_nom,
       a.id AS attachment_id, a.filename AS attachment_filename
     FROM quotes q
     JOIN quote_request_suppliers qrs ON qrs.id = q.quote_request_supplier_id
     JOIN quote_requests qr ON qr.id = qrs.quote_request_id
     JOIN suppliers s ON s.id = qrs.supplier_id
     LEFT JOIN LATERAL (
       SELECT id, filename FROM attachments WHERE quote_id = q.id ORDER BY uploaded_at DESC LIMIT 1
     ) a ON true
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

// ─── Réouverture de consultation : remise à zéro de la sélection ──────────
async function unselectAllQuotes(prId) {
  await run(
    `UPDATE quotes SET selectionne = false
     WHERE quote_request_supplier_id IN (
       SELECT qrs.id FROM quote_request_suppliers qrs
       JOIN quote_requests qr ON qr.id = qrs.quote_request_id
       WHERE qr.purchase_request_id = $1
     )`,
    [prId]
  );
}

async function clearLinesSelection(prId) {
  await run('UPDATE purchase_request_lines SET fournisseur_retenu_id = NULL, prix_unitaire_final = NULL WHERE purchase_request_id = $1', [prId]);
}

async function clearMontantFinal(prId) {
  await run('UPDATE purchase_requests SET montant_final = NULL, updated_at = now() WHERE id = $1', [prId]);
}

async function deletePendingApprovals(prId) {
  await run("DELETE FROM approvals WHERE purchase_request_id = $1 AND statut = 'en_attente'", [prId]);
}

module.exports = {
  createDraft, setNumero, getById, list, listVisibleTo, listPendingAction, updateStatusAndStep, setMontantFinal,
  addLine, getLines, getLine, updateLine, deleteLine, setLinesFournisseurRetenu, setLinesPrixUnitaireFinal,
  createQuoteRequest, addQuoteRequestSupplier, getQuoteRequest, getQuoteRequestSuppliers,
  getQuoteRequestSupplier, markQuoteRequestSupplierSent, getQuoteRequestsForPR,
  createQuote, getQuote, getQuotesForPR, selectQuote, getAttachments,
  createQuoteLines, getQuoteLines, applyQuoteLinesToPrLines,
  createApproval, getPendingApproval, decideApproval, getApprovalsForPR,
  unselectAllQuotes, clearLinesSelection, clearMontantFinal, deletePendingApprovals,
};
