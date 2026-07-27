const { all, one, run } = require('../../db');
const { httpError } = require('../../utils/httpError');

const PRICE_SELECT = `
  SELECT pp.*, p.code AS product_code, p.designation AS product_designation,
         p.business_unit_id, bu.nom AS business_unit_nom,
         u.nom AS created_by_nom, u.prenom AS created_by_prenom
  FROM product_prices pp
  JOIN products p ON p.id = pp.product_id
  LEFT JOIN business_units bu ON bu.id = p.business_unit_id
  JOIN users u ON u.id = pp.created_by
`;

function buildFilters(params, { businessUnitId, categoryId, productId }) {
  const clauses = [];
  if (businessUnitId) { params.push(businessUnitId); clauses.push(`p.business_unit_id = $${params.length}`); }
  if (categoryId) { params.push(categoryId); clauses.push(`p.category_id = $${params.length}`); }
  if (productId) { params.push(productId); clauses.push(`pp.product_id = $${params.length}`); }
  return clauses;
}

// Ajoute un CHANGEMENT DE PRIX — jamais d'upsert : chaque appel crée une nouvelle ligne
// d'historique, même si un prix existe déjà à cette date pour ce produit (un produit peut
// légitimement changer de prix plusieurs fois le même jour, ex. correction d'une erreur de saisie).
async function addPrice(user, { productId, prix, devise, dateEffet, commentaire }) {
  if (!productId) throw httpError(400, 'productId requis.');
  if (prix === undefined || prix === null || Number.isNaN(Number(prix))) {
    throw httpError(400, 'prix requis (nombre).');
  }
  if (!dateEffet) throw httpError(400, "dateEffet requis (date d'effet du prix).");

  const product = await one('SELECT id FROM products WHERE id = $1', [productId]);
  if (!product) throw httpError(404, 'Produit introuvable.');

  const row = await one(
    `INSERT INTO product_prices (product_id, prix, devise, date_effet, commentaire, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [productId, prix, devise || 'GNF', dateEffet, commentaire || null, user.id]
  );
  return one(`${PRICE_SELECT} WHERE pp.id = $1`, [row.id]);
}

async function listPrices(user, { dateFrom, dateTo, businessUnitId, categoryId, productId }) {
  const params = [];
  const clauses = buildFilters(params, { businessUnitId, categoryId, productId });
  if (dateFrom) { params.push(dateFrom); clauses.push(`pp.date_effet >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`pp.date_effet <= $${params.length}`); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(`${PRICE_SELECT} ${where} ORDER BY pp.date_effet DESC, pp.created_at DESC`, params);
}

// Dernier prix connu par produit (le plus récent par date_effet, puis par created_at en cas
// d'égalité) — pour un tableau "prix actuels" par BU, même logique que le "latest" de stock.
async function getCurrentPrices(user, { businessUnitId, categoryId }) {
  const params = [];
  const clauses = buildFilters(params, { businessUnitId, categoryId });
  const where = clauses.length ? `AND ${clauses.join(' AND ')}` : '';
  return all(
    `SELECT DISTINCT ON (p.id) p.id AS product_id, p.code, p.designation,
            p.business_unit_id, bu.nom AS business_unit,
            pp.prix, pp.devise, pp.date_effet
     FROM products p
     JOIN product_prices pp ON pp.product_id = p.id
     LEFT JOIN business_units bu ON bu.id = p.business_unit_id
     WHERE p.actif = true ${where}
     ORDER BY p.id, pp.date_effet DESC, pp.created_at DESC`,
    params
  );
}

async function getPriceSeries(user, { productId, dateFrom, dateTo }) {
  if (!productId) throw httpError(400, 'productId requis.');
  const params = [productId];
  const clauses = ['pp.product_id = $1'];
  if (dateFrom) { params.push(dateFrom); clauses.push(`pp.date_effet >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`pp.date_effet <= $${params.length}`); }
  return all(
    `SELECT pp.date_effet, pp.prix::float AS prix, pp.devise
     FROM product_prices pp
     WHERE ${clauses.join(' AND ')}
     ORDER BY pp.date_effet, pp.created_at`,
    params
  );
}

// Correction d'une ligne d'historique déjà saisie — réservé au niveau "edition" (voir
// requirePrixLevel dans prices.routes.js, §2.6 SPEC.md). Reste une exception ponctuelle au
// principe "jamais d'upsert" du §3.8 : la correction d'une vraie erreur de saisie (montant, date,
// produit) ne doit pas nécessiter de contourner l'API en base directement, mais ce n'est pas une
// opération que le niveau "ajout" (écriture normale) doit offrir.
async function updatePrice(id, { prix, devise, dateEffet, commentaire }) {
  const existing = await one('SELECT * FROM product_prices WHERE id = $1', [id]);
  if (!existing) throw httpError(404, 'Entrée de prix introuvable.');
  await run(
    `UPDATE product_prices SET prix=$1, devise=$2, date_effet=$3, commentaire=$4 WHERE id=$5`,
    [
      prix !== undefined && prix !== null && prix !== '' ? prix : existing.prix,
      devise || existing.devise,
      dateEffet || existing.date_effet,
      commentaire === undefined ? existing.commentaire : commentaire,
      id,
    ]
  );
  return one(`${PRICE_SELECT} WHERE pp.id = $1`, [id]);
}

async function deletePrice(id) {
  const existing = await one('SELECT id FROM product_prices WHERE id = $1', [id]);
  if (!existing) throw httpError(404, 'Entrée de prix introuvable.');
  await run('DELETE FROM product_prices WHERE id = $1', [id]);
}

module.exports = { addPrice, listPrices, getCurrentPrices, getPriceSeries, updatePrice, deletePrice };
