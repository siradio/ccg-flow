const { all, one } = require('../../db');

async function create({ purchaseRequestId, numero, supplierId, montant, devise }) {
  return one(
    `INSERT INTO purchase_orders (purchase_request_id, numero, supplier_id, montant, devise)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [purchaseRequestId, numero, supplierId, montant, devise]
  );
}

async function setNumero(id, numero) {
  return one('UPDATE purchase_orders SET numero = $1 WHERE id = $2 RETURNING *', [numero, id]);
}

async function getById(id) {
  return one(
    `SELECT po.*, s.nom AS supplier_nom, pr.numero AS purchase_request_numero, pr.entity_id, pr.objet,
            e.nom AS entity_nom, e.code AS entity_code
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN purchase_requests pr ON pr.id = po.purchase_request_id
     JOIN entities e ON e.id = pr.entity_id
     WHERE po.id = $1`,
    [id]
  );
}

async function getByPurchaseRequestId(prId) {
  return one('SELECT * FROM purchase_orders WHERE purchase_request_id = $1', [prId]);
}

module.exports = { create, setNumero, getById, getByPurchaseRequestId };
