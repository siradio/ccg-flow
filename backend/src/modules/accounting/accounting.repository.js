const { all, one, run } = require('../../db');

// Identité générique du traitement pour un BDC issu des Achats.
const SRC = { module: 'PURCHASE', type: 'PURCHASE_ORDER', processingType: 'PURCHASE_ORDER_ACCOUNTING' };
const JOIN_AP = `LEFT JOIN accounting_processing ap
  ON ap.source_module = 'PURCHASE' AND ap.source_document_type = 'PURCHASE_ORDER' AND ap.source_document_id = po.id`;

// Une ligne = un BDC achat enrichi (DA, entité, BU, demandeur, fournisseur) + son état de
// traitement comptable (jointure sur accounting_processing ; NULL => Non traité).
const BDC_SELECT = `
  SELECT po.id AS po_id, po.numero AS bdc_numero, po.montant, po.devise, po.generated_at,
         po.mode_paiement, po.conditions_paiement,
         pr.id AS pr_id, pr.numero AS da_numero, pr.objet, pr.justification,
         pr.created_at AS da_date, pr.status AS da_status, pr.receptionnee,
         e.id AS entity_id, e.code AS entity_code, e.nom AS entity_nom,
         bu.nom AS business_unit_nom,
         TRIM(CONCAT(u.prenom, ' ', u.nom)) AS demandeur, emp.departement AS departement,
         s.nom AS fournisseur,
         COALESCE(ap.status, 'NOT_PROCESSED') AS processing_status,
         ap.assigned_to, TRIM(CONCAT(ag.prenom, ' ', ag.nom)) AS assigned_nom, ap.processing_started_at,
         ap.processed_by, TRIM(CONCAT(pg.prenom, ' ', pg.nom)) AS processed_nom, ap.processed_at
  FROM purchase_orders po
  JOIN purchase_requests pr ON pr.id = po.purchase_request_id
  JOIN entities e ON e.id = pr.entity_id
  LEFT JOIN business_units bu ON bu.id = pr.business_unit_id
  LEFT JOIN users u ON u.id = pr.requester_user_id
  LEFT JOIN employees emp ON emp.id = u.employee_id
  LEFT JOIN suppliers s ON s.id = po.supplier_id
  ${JOIN_AP}
  LEFT JOIN users ag ON ag.id = ap.assigned_to
  LEFT JOIN users pg ON pg.id = ap.processed_by`;

// Construit la clause WHERE + params à partir des filtres (partagée liste + total).
function buildWhere(f) {
  const where = [];
  const params = [];
  const P = (v) => { params.push(v); return `$${params.length}`; };
  if (f.from) where.push(`po.generated_at >= ${P(f.from)}`);
  if (f.to) where.push(`po.generated_at < (${P(f.to)}::date + INTERVAL '1 day')`);
  if (f.entityId) where.push(`pr.entity_id = ${P(Number(f.entityId))}`);
  if (f.supplierId) where.push(`po.supplier_id = ${P(Number(f.supplierId))}`);
  if (f.devise) where.push(`po.devise = ${P(f.devise)}`);
  if (f.numero) where.push(`po.numero ILIKE ${P('%' + f.numero + '%')}`);
  if (f.daNumero) where.push(`pr.numero ILIKE ${P('%' + f.daNumero + '%')}`);
  if (f.q) {
    const like = P('%' + f.q.toLowerCase() + '%');
    where.push(`(LOWER(po.numero) LIKE ${like} OR LOWER(pr.numero) LIKE ${like} OR LOWER(COALESCE(pr.objet,'')) LIKE ${like} OR LOWER(COALESCE(s.nom,'')) LIKE ${like})`);
  }
  // Statut de traitement comptable (NON traité = absence de ligne accounting_processing).
  if (f.status === 'NOT_PROCESSED') where.push(`ap.status IS NULL`);
  else if (f.status === 'IN_PROGRESS' || f.status === 'PROCESSED') where.push(`ap.status = ${P(f.status)}`);
  // Agent : mes traitements / non affectés / agent précis.
  if (f.mine) where.push(`ap.assigned_to = ${P(Number(f.userId))}`);
  else if (f.unassigned) where.push(`ap.assigned_to IS NULL`);
  else if (f.assignedTo) where.push(`ap.assigned_to = ${P(Number(f.assignedTo))}`);
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

async function listPurchaseOrders(f) {
  const { sql, params } = buildWhere(f);
  const total = Number((await one(
    `SELECT COUNT(*)::int AS n FROM purchase_orders po
       JOIN purchase_requests pr ON pr.id = po.purchase_request_id
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       ${JOIN_AP}
     ${sql}`, params)).n);
  const page = Math.max(1, Number(f.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(f.pageSize) || 20));
  const p2 = [...params, pageSize, (page - 1) * pageSize];
  const items = await all(
    `${BDC_SELECT} ${sql} ORDER BY po.generated_at DESC, po.id DESC LIMIT $${p2.length - 1} OFFSET $${p2.length}`, p2);
  return { items, total, page, pageSize };
}

async function getPurchaseOrder(poId) {
  return one(`${BDC_SELECT} WHERE po.id = $1`, [poId]);
}

async function getProcessingByPo(poId) {
  return one(
    `SELECT ap.*, TRIM(CONCAT(ag.prenom, ' ', ag.nom)) AS assigned_nom
       FROM accounting_processing ap LEFT JOIN users ag ON ag.id = ap.assigned_to
      WHERE ap.source_module = $1 AND ap.source_document_type = $2 AND ap.source_document_id = $3`,
    [SRC.module, SRC.type, poId]);
}

// Prise en charge ATOMIQUE : l'INSERT « ON CONFLICT DO NOTHING » sur la contrainte UNIQUE garantit
// qu'un seul agent crée la ligne IN_PROGRESS. Retourne la ligne si CET agent l'a obtenue, sinon null
// (un autre agent l'a déjà — ou elle existe déjà, l'appelant lira alors l'état réel).
async function takeOver(poId, userId, { companyId, reference }) {
  const res = await run(
    `INSERT INTO accounting_processing
       (company_id, source_module, source_document_type, source_document_id, source_document_reference,
        processing_type, status, assigned_to, processing_started_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'IN_PROGRESS', $7, now())
     ON CONFLICT (source_module, source_document_type, source_document_id) DO NOTHING
     RETURNING *`,
    [companyId, SRC.module, SRC.type, poId, reference, SRC.processingType, userId]);
  return res.rows[0] || null;
}

// Finalisation : uniquement si en cours ET affecté à cet agent. rowCount=0 => refus (traité par
// l'appelant selon l'état réel).
async function complete(poId, userId) {
  const res = await run(
    `UPDATE accounting_processing
        SET status = 'PROCESSED', processed_by = $1, processed_at = now(), updated_at = now()
      WHERE source_module = $2 AND source_document_type = $3 AND source_document_id = $4
        AND status = 'IN_PROGRESS' AND assigned_to = $1
      RETURNING *`,
    [userId, SRC.module, SRC.type, poId]);
  return { row: res.rows[0] || null, rowCount: res.rowCount };
}

// Indicateurs de la file (page d'entrée) — calculés, jamais figés.
async function stats(f) {
  const { sql, params } = buildWhere({ ...f, status: null, mine: false, unassigned: false, assignedTo: null });
  return one(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ap.status IS NULL)::int AS non_traites,
            COUNT(*) FILTER (WHERE ap.status = 'IN_PROGRESS')::int AS en_cours,
            COUNT(*) FILTER (WHERE ap.status = 'PROCESSED')::int AS traites,
            COUNT(*) FILTER (WHERE po.generated_at >= date_trunc('month', CURRENT_DATE))::int AS ce_mois,
            COUNT(DISTINCT po.supplier_id)::int AS fournisseurs
       FROM purchase_orders po
       JOIN purchase_requests pr ON pr.id = po.purchase_request_id
       ${JOIN_AP}
     ${sql}`, params);
}

module.exports = { listPurchaseOrders, getPurchaseOrder, getProcessingByPo, takeOver, complete, stats, SRC };
