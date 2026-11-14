const { all, one, run } = require('../../db');

async function create({ purchaseRequestId, numero, supplierId, montant, devise, modePaiement = null, conditionsPaiement = null }) {
  return one(
    `INSERT INTO purchase_orders (purchase_request_id, numero, supplier_id, montant, devise, mode_paiement, conditions_paiement)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [purchaseRequestId, numero, supplierId, montant, devise, modePaiement, conditionsPaiement]
  );
}

async function setNumero(id, numero) {
  return one('UPDATE purchase_orders SET numero = $1 WHERE id = $2 RETURNING *', [numero, id]);
}

async function getById(id) {
  return one(
    `SELECT po.*, s.nom AS supplier_nom, s.contact_email AS supplier_email,
            pr.numero AS purchase_request_numero, pr.entity_id, pr.objet, pr.business_unit_id,
            e.nom AS entity_nom, e.code AS entity_code,
            bu.nom AS business_unit_nom
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN purchase_requests pr ON pr.id = po.purchase_request_id
     JOIN entities e ON e.id = pr.entity_id
     LEFT JOIN business_units bu ON bu.id = pr.business_unit_id
     WHERE po.id = $1`,
    [id]
  );
}

async function getByPurchaseRequestId(prId) {
  return one('SELECT * FROM purchase_orders WHERE purchase_request_id = $1', [prId]);
}

// Supprime le bon de commande d'une demande (réouverture de consultation). Les pièces jointes du
// BC sont supprimées en cascade (attachments.purchase_order_id ON DELETE CASCADE).
async function deleteByPurchaseRequestId(prId) {
  await run('DELETE FROM purchase_orders WHERE purchase_request_id = $1', [prId]);
}

// Frais annexes du bon de commande (instantané des frais du devis retenu) + sous-total mémorisé.
async function setFees(poId, rows) {
  await run('DELETE FROM purchase_order_fees WHERE purchase_order_id = $1', [poId]);
  let ordre = 0, total = 0;
  for (const r of rows) {
    const m = Number(r.montant) || 0; total += m;
    await run('INSERT INTO purchase_order_fees (purchase_order_id, fee_type_id, libelle_fige, montant, ordre) VALUES ($1,$2,$3,$4,$5)',
      [poId, r.fee_type_id ?? r.feeTypeId ?? null, r.libelle ?? r.libelle_fige, m, ordre++]);
  }
  await run('UPDATE purchase_orders SET montant_frais = $2 WHERE id = $1', [poId, total]);
  return total;
}
async function getFees(poId) {
  return all('SELECT fee_type_id, libelle_fige AS libelle, montant FROM purchase_order_fees WHERE purchase_order_id = $1 ORDER BY ordre, id', [poId]);
}

module.exports = { create, setNumero, getById, getByPurchaseRequestId, deleteByPurchaseRequestId, setFees, getFees };
