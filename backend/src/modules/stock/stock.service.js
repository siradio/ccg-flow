const { all, one, run } = require('../../db');
const { httpError } = require('../../utils/httpError');
const { isSuperAdmin, canWriteBusinessUnit, visibleBusinessUnitIds } = require('../../middleware/permissions');

const ENTRY_SELECT = `
  SELECT se.*, p.code AS product_code, p.designation AS product_designation, p.unite AS product_unite,
         p.seuil_alerte_stock, bu.id AS business_unit_id, bu.nom AS business_unit_nom,
         cu.nom AS created_by_nom, cu.prenom AS created_by_prenom,
         uu.nom AS updated_by_nom, uu.prenom AS updated_by_prenom
  FROM stock_entries se
  JOIN products p ON p.id = se.product_id
  JOIN business_units bu ON bu.id = p.business_unit_id
  JOIN users cu ON cu.id = se.created_by
  LEFT JOIN users uu ON uu.id = se.updated_by
`;

async function assertProductWritable(user, productId) {
  const product = await one('SELECT id, business_unit_id FROM products WHERE id = $1', [productId]);
  if (!product) throw httpError(404, 'Produit introuvable.');
  if (!product.business_unit_id) {
    throw httpError(400, "Ce produit n'est rattaché à aucune Business Unit : le suivi de stock quotidien n'est possible que pour un produit rattaché à une BU.");
  }
  if (!canWriteBusinessUnit(user, product.business_unit_id)) {
    throw httpError(403, "Vous n'avez pas accès en écriture à la Business Unit de ce produit.");
  }
  return product;
}

// Crée ou met à jour l'entrée du jour pour ce produit — jamais de duplication (contrainte
// unique date_stock+product_id), une resaisie le même jour remplace la précédente.
async function upsertEntry(user, { dateStock, productId, quantite, unite, commentaire }) {
  if (!dateStock) throw httpError(400, 'dateStock requis.');
  if (quantite === undefined || quantite === null || Number.isNaN(Number(quantite))) {
    throw httpError(400, 'quantite requise (nombre).');
  }
  await assertProductWritable(user, productId);

  const existing = await one(
    'SELECT id FROM stock_entries WHERE date_stock = $1 AND product_id = $2',
    [dateStock, productId]
  );

  let id;
  if (existing) {
    await run(
      `UPDATE stock_entries SET quantite=$1, unite=$2, commentaire=$3, updated_by=$4, updated_at=now() WHERE id=$5`,
      [quantite, unite || null, commentaire || null, user.id, existing.id]
    );
    id = existing.id;
  } else {
    const row = await one(
      `INSERT INTO stock_entries (date_stock, product_id, quantite, unite, commentaire, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
      [dateStock, productId, quantite, unite || null, commentaire || null, user.id]
    );
    id = row.id;
  }
  return one(`${ENTRY_SELECT} WHERE se.id = $1`, [id]);
}

// Liste des Business Units que l'utilisateur peut voir (null = pas de restriction = toutes).
async function businessUnitsVisibleTo(user) {
  const visible = visibleBusinessUnitIds(user);
  if (visible === null) {
    return all('SELECT id, code, nom FROM business_units ORDER BY nom');
  }
  if (visible.length === 0) return [];
  return all('SELECT id, code, nom FROM business_units WHERE id = ANY($1) ORDER BY nom', [visible]);
}

async function listEntries(user, { dateStock, dateFrom, dateTo, businessUnitId, productId }) {
  const clauses = [];
  const params = [];

  const visible = visibleBusinessUnitIds(user);
  if (visible !== null) {
    if (visible.length === 0) return [];
    params.push(visible);
    clauses.push(`p.business_unit_id = ANY($${params.length})`);
  }

  if (businessUnitId) { params.push(businessUnitId); clauses.push(`p.business_unit_id = $${params.length}`); }
  if (productId) { params.push(productId); clauses.push(`se.product_id = $${params.length}`); }
  if (dateStock) { params.push(dateStock); clauses.push(`se.date_stock = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); clauses.push(`se.date_stock >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`se.date_stock <= $${params.length}`); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(`${ENTRY_SELECT} ${where} ORDER BY se.date_stock DESC, p.designation`, params);
}

async function getEntry(user, id) {
  const entry = await one(`${ENTRY_SELECT} WHERE se.id = $1`, [id]);
  if (!entry) return null;
  const visible = visibleBusinessUnitIds(user);
  if (visible !== null && !visible.includes(entry.business_unit_id)) {
    throw httpError(403, "Vous n'avez pas accès à cette Business Unit.");
  }
  return entry;
}

async function deleteEntry(user, id) {
  const entry = await one('SELECT se.id, p.business_unit_id FROM stock_entries se JOIN products p ON p.id = se.product_id WHERE se.id = $1', [id]);
  if (!entry) throw httpError(404, 'Saisie introuvable.');
  if (!canWriteBusinessUnit(user, entry.business_unit_id)) {
    throw httpError(403, "Vous n'avez pas accès en écriture à la Business Unit de cette saisie.");
  }
  await run('DELETE FROM stock_entries WHERE id = $1', [id]);
}

// Grille de saisie rapide pour une BU + une date : tous les produits actifs de la BU, avec
// leur saisie existante pour ce jour s'il y en a une déjà (permet l'édition en ligne).
async function getDaySheet(user, { dateStock, businessUnitId }) {
  if (!dateStock) throw httpError(400, 'dateStock requis.');
  if (!businessUnitId) throw httpError(400, 'businessUnitId requis.');
  const visible = visibleBusinessUnitIds(user);
  if (visible !== null && !visible.includes(Number(businessUnitId))) {
    throw httpError(403, "Vous n'avez pas accès à cette Business Unit.");
  }
  const products = await all(
    `SELECT p.id AS product_id, p.code, p.designation, p.unite, p.seuil_alerte_stock,
            se.id AS entry_id, se.quantite, se.commentaire, se.updated_at
     FROM products p
     LEFT JOIN stock_entries se ON se.product_id = p.id AND se.date_stock = $1
     WHERE p.business_unit_id = $2 AND p.actif = true
     ORDER BY p.designation`,
    [dateStock, businessUnitId]
  );
  return { canWrite: canWriteBusinessUnit(user, Number(businessUnitId)), products };
}

module.exports = { upsertEntry, listEntries, getEntry, deleteEntry, businessUnitsVisibleTo, getDaySheet };
