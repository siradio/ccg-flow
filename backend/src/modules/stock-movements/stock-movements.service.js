const { all, one, run } = require('../../db');
const { httpError } = require('../../utils/httpError');
const { canWriteBusinessUnit, visibleBusinessUnitIds } = require('../../middleware/permissions');

const MOVEMENT_SELECT = `
  SELECT sm.*, p.code AS product_code, p.designation AS product_designation, p.unite AS product_unite,
         bu.id AS business_unit_id, bu.nom AS business_unit_nom,
         u.nom AS created_by_nom, u.prenom AS created_by_prenom
  FROM stock_movements sm
  JOIN products p ON p.id = sm.product_id
  JOIN business_units bu ON bu.id = p.business_unit_id
  JOIN users u ON u.id = sm.created_by
`;

// Même contrôle d'accès en écriture que la saisie du jour (stock.service.js) — un mouvement de
// stock respecte les mêmes droits par Business Unit (§2.4), les deux étant des sections sœurs du
// même module `stock` (§3.6).
async function assertProductWritable(user, productId) {
  const product = await one('SELECT id, business_unit_id FROM products WHERE id = $1', [productId]);
  if (!product) throw httpError(404, 'Produit introuvable.');
  if (!product.business_unit_id) {
    throw httpError(400, "Ce produit n'est rattaché à aucune Business Unit : le suivi des mouvements n'est possible que pour un produit rattaché à une BU.");
  }
  if (!canWriteBusinessUnit(user, product.business_unit_id)) {
    throw httpError(403, "Vous n'avez pas accès en écriture à la Business Unit de ce produit.");
  }
  return product;
}

// Ajoute un mouvement — jamais d'upsert : chaque réception/sortie est un événement distinct,
// même principe que product_prices (voir la migration 010).
async function addMovement(user, { productId, typeMouvement, quantite, dateMouvement, motif, referenceDocument }) {
  if (!productId) throw httpError(400, 'productId requis.');
  if (!['entree', 'sortie'].includes(typeMouvement)) {
    throw httpError(400, "typeMouvement invalide, attendu 'entree' ou 'sortie'.");
  }
  if (quantite === undefined || quantite === null || Number(quantite) <= 0) {
    throw httpError(400, 'quantite requise (nombre positif).');
  }
  if (!dateMouvement) throw httpError(400, 'dateMouvement requis.');

  await assertProductWritable(user, productId);

  const row = await one(
    `INSERT INTO stock_movements (product_id, type_mouvement, quantite, date_mouvement, motif, reference_document, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [productId, typeMouvement, quantite, dateMouvement, motif || null, referenceDocument || null, user.id]
  );
  return one(`${MOVEMENT_SELECT} WHERE sm.id = $1`, [row.id]);
}

async function listMovements(user, { dateFrom, dateTo, businessUnitId, productId, typeMouvement }) {
  const clauses = [];
  const params = [];

  const visible = visibleBusinessUnitIds(user);
  if (visible !== null) {
    if (visible.length === 0) return [];
    params.push(visible);
    clauses.push(`p.business_unit_id = ANY($${params.length})`);
  }

  if (businessUnitId) { params.push(businessUnitId); clauses.push(`p.business_unit_id = $${params.length}`); }
  if (productId) { params.push(productId); clauses.push(`sm.product_id = $${params.length}`); }
  if (typeMouvement) { params.push(typeMouvement); clauses.push(`sm.type_mouvement = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); clauses.push(`sm.date_mouvement >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`sm.date_mouvement <= $${params.length}`); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(`${MOVEMENT_SELECT} ${where} ORDER BY sm.date_mouvement DESC, sm.created_at DESC`, params);
}

async function deleteMovement(user, id) {
  const movement = await one(
    'SELECT sm.id, p.business_unit_id FROM stock_movements sm JOIN products p ON p.id = sm.product_id WHERE sm.id = $1',
    [id]
  );
  if (!movement) throw httpError(404, 'Mouvement introuvable.');
  if (!canWriteBusinessUnit(user, movement.business_unit_id)) {
    throw httpError(403, "Vous n'avez pas accès en écriture à la Business Unit de ce mouvement.");
  }
  await run('DELETE FROM stock_movements WHERE id = $1', [id]);
}

module.exports = { addMovement, listMovements, deleteMovement };
