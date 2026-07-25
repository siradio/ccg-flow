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

// Évolution quotidienne du stock total par BU, telle que réellement saisie (somme des saisies
// existantes par jour/BU) — un jour sans saisie pour un produit n'est pas comblé artificiellement,
// il n'apparaît simplement pas dans la somme de ce jour-là pour ce produit.
async function getSeriesByBu(user, { dateFrom, dateTo }) {
  if (!dateFrom || !dateTo) throw httpError(400, 'dateFrom et dateTo requis.');
  const clauses = ['se.date_stock >= $1', 'se.date_stock <= $2'];
  const params = [dateFrom, dateTo];

  const visible = visibleBusinessUnitIds(user);
  if (visible !== null) {
    if (visible.length === 0) return [];
    params.push(visible);
    clauses.push(`p.business_unit_id = ANY($${params.length})`);
  }

  return all(
    `SELECT se.date_stock, bu.id AS business_unit_id, bu.nom AS business_unit,
            SUM(se.quantite)::float AS total
     FROM stock_entries se
     JOIN products p ON p.id = se.product_id
     JOIN business_units bu ON bu.id = p.business_unit_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY se.date_stock, bu.id, bu.nom
     ORDER BY se.date_stock`,
    params
  );
}

// Évolution quotidienne d'un produit précis (ex. pour tracer sa courbe sur la période choisie).
async function getSeriesByProduct(user, { productId, dateFrom, dateTo }) {
  if (!productId) throw httpError(400, 'productId requis.');
  if (!dateFrom || !dateTo) throw httpError(400, 'dateFrom et dateTo requis.');

  const product = await one('SELECT id, business_unit_id FROM products WHERE id = $1', [productId]);
  if (!product) throw httpError(404, 'Produit introuvable.');
  const visible = visibleBusinessUnitIds(user);
  if (visible !== null && !visible.includes(product.business_unit_id)) {
    throw httpError(403, "Vous n'avez pas accès à cette Business Unit.");
  }

  return all(
    `SELECT date_stock, quantite::float AS quantite
     FROM stock_entries
     WHERE product_id = $1 AND date_stock >= $2 AND date_stock <= $3
     ORDER BY date_stock`,
    [productId, dateFrom, dateTo]
  );
}

// --- Tableau de bord exécutif DG ---------------------------------------------------------
//
// Toutes les requêtes ci-dessous partagent le même filtre "produit" (BU visibles pour
// l'utilisateur + filtres optionnels BU/catégorie/produit choisis dans l'UI), pour rester
// cohérentes entre les différents blocs du dashboard.

function productFilterClauses(params, { visible, businessUnitId, categoryId, productId }) {
  const clauses = ['p.actif = true'];
  if (visible !== null) {
    if (visible.length === 0) { clauses.push('FALSE'); return clauses; }
    params.push(visible);
    clauses.push(`p.business_unit_id = ANY($${params.length})`);
  }
  if (businessUnitId) { params.push(businessUnitId); clauses.push(`p.business_unit_id = $${params.length}`); }
  if (categoryId) { params.push(categoryId); clauses.push(`p.category_id = $${params.length}`); }
  if (productId) { params.push(productId); clauses.push(`p.id = $${params.length}`); }
  return clauses;
}

// Stock total par BU + global "tel que connu à la date asOfDate" : pour chaque produit, la
// dernière saisie dont la date est <= asOfDate (report de la dernière valeur connue, pas
// seulement les saisies du jour précis).
async function totalsAsOf(asOfDate, filters) {
  const params = [asOfDate];
  const where = productFilterClauses(params, filters).join(' AND ');
  const byBu = await all(
    `WITH latest AS (
       SELECT DISTINCT ON (p.id) p.id AS product_id, p.business_unit_id, se.quantite
       FROM products p
       JOIN stock_entries se ON se.product_id = p.id AND se.date_stock <= $1
       WHERE ${where}
       ORDER BY p.id, se.date_stock DESC
     )
     SELECT bu.id AS business_unit_id, bu.nom AS business_unit, COALESCE(SUM(latest.quantite), 0)::float AS total
     FROM business_units bu
     LEFT JOIN latest ON latest.business_unit_id = bu.id
     GROUP BY bu.id, bu.nom
     ORDER BY bu.nom`,
    params
  );
  return { byBu, global: byBu.reduce((sum, r) => sum + r.total, 0) };
}

async function latestSnapshot(asOfDate, filters) {
  const params = [asOfDate];
  const where = productFilterClauses(params, filters).join(' AND ');
  return all(
    `SELECT DISTINCT ON (p.id) p.id AS product_id, p.code, p.designation, p.seuil_alerte_stock,
            p.business_unit_id, bu.nom AS business_unit, se.quantite::float AS quantite, se.date_stock
     FROM products p
     JOIN stock_entries se ON se.product_id = p.id AND se.date_stock <= $1
     JOIN business_units bu ON bu.id = p.business_unit_id
     WHERE ${where}
     ORDER BY p.id, se.date_stock DESC`,
    params
  );
}

// Les deux dates de saisie les plus récentes (<= asOfDate) parmi les produits filtrés — sert
// de base à la variation "jour vs jour précédent" (qui n'est pas forcément J vs J-1 calendaire :
// les saisies ne sont pas garanties tous les jours).
async function distinctDatesDesc(asOfDate, filters, limit) {
  const params = [asOfDate];
  const where = productFilterClauses(params, filters).join(' AND ');
  const rows = await all(
    `SELECT DISTINCT se.date_stock
     FROM stock_entries se JOIN products p ON p.id = se.product_id
     WHERE se.date_stock <= $1 AND ${where}
     ORDER BY se.date_stock DESC
     LIMIT ${Number(limit)}`,
    params
  );
  return rows.map(r => r.date_stock);
}

function delta(curr, prev) {
  if (prev == null) return { previousTotal: null, deltaAbs: null, deltaPct: null };
  const deltaAbs = curr - prev;
  return { previousTotal: prev, deltaAbs, deltaPct: prev !== 0 ? deltaAbs / prev : null };
}

// Plus fortes baisses/hausses sur la période choisie : pour chaque produit ayant au moins 2
// saisies distinctes dans [dateFrom, dateTo], écart entre sa première et sa dernière saisie
// de la période (pas nécessairement J vs J-1 : dépend de quand le produit a été saisi).
async function topMovers(dateFrom, dateTo, filters, limit) {
  const params = [dateFrom, dateTo];
  const where = productFilterClauses(params, filters).join(' AND ');
  const rows = await all(
    `WITH first_in_period AS (
       SELECT DISTINCT ON (p.id) p.id AS product_id, se.quantite AS start_qty, se.date_stock AS start_date
       FROM products p JOIN stock_entries se ON se.product_id = p.id
       WHERE se.date_stock BETWEEN $1 AND $2 AND ${where}
       ORDER BY p.id, se.date_stock ASC
     ),
     last_in_period AS (
       SELECT DISTINCT ON (p.id) p.id AS product_id, se.quantite AS end_qty, se.date_stock AS end_date
       FROM products p JOIN stock_entries se ON se.product_id = p.id
       WHERE se.date_stock BETWEEN $1 AND $2 AND ${where}
       ORDER BY p.id, se.date_stock DESC
     )
     SELECT p.id AS product_id, p.code, p.designation, bu.nom AS business_unit,
            f.start_qty::float AS start_qty, f.start_date, l.end_qty::float AS end_qty, l.end_date,
            (l.end_qty - f.start_qty)::float AS delta_abs
     FROM first_in_period f
     JOIN last_in_period l ON l.product_id = f.product_id
     JOIN products p ON p.id = f.product_id
     JOIN business_units bu ON bu.id = p.business_unit_id
     WHERE f.start_date != l.end_date`,
    params
  );
  const drops = [...rows].filter(r => r.delta_abs < 0).sort((a, b) => a.delta_abs - b.delta_abs).slice(0, limit);
  const gains = [...rows].filter(r => r.delta_abs > 0).sort((a, b) => b.delta_abs - a.delta_abs).slice(0, limit);
  return { drops, gains };
}

async function getGlobalEvolution(dateFrom, dateTo, filters) {
  const params = [dateFrom, dateTo];
  const where = productFilterClauses(params, filters).join(' AND ');
  return all(
    `SELECT se.date_stock, SUM(se.quantite)::float AS total
     FROM stock_entries se JOIN products p ON p.id = se.product_id
     WHERE se.date_stock BETWEEN $1 AND $2 AND ${where}
     GROUP BY se.date_stock ORDER BY se.date_stock`,
    params
  );
}

// Vue consolidée pour le Directeur Général : "en moins de 30 secondes" — état actuel, variation
// jour vs jour précédent, alertes rupture/seuil, top mouvements sur la période, courbe globale.
async function getDgDashboard(user, { dateFrom, dateTo, businessUnitId, categoryId, productId }) {
  if (!dateFrom || !dateTo) throw httpError(400, 'dateFrom et dateTo requis.');
  const visible = visibleBusinessUnitIds(user);
  const filters = { visible, businessUnitId: businessUnitId || null, categoryId: categoryId || null, productId: productId || null };

  const [d1, d2] = await distinctDatesDesc(dateTo, filters, 2);

  const current = d1 ? await totalsAsOf(d1, filters) : { byBu: [], global: 0 };
  const previous = d2 ? await totalsAsOf(d2, filters) : null;
  const snapshot = d1 ? await latestSnapshot(d1, filters) : [];

  const prevByBu = new Map((previous?.byBu || []).map(r => [r.business_unit_id, r.total]));
  const byBu = current.byBu.map(r => ({ ...r, ...delta(r.total, prevByBu.has(r.business_unit_id) ? prevByBu.get(r.business_unit_id) : null) }));
  const global = { total: current.global, ...delta(current.global, previous ? previous.global : null) };

  const rupture = snapshot.filter(r => Number(r.quantite) === 0);
  const seuilBas = snapshot.filter(r => r.seuil_alerte_stock != null && Number(r.quantite) > 0 && Number(r.quantite) < Number(r.seuil_alerte_stock));
  const topStock = [...snapshot].sort((a, b) => Number(b.quantite) - Number(a.quantite)).slice(0, 10);

  const { drops, gains } = await topMovers(dateFrom, dateTo, filters, 10);
  const evolution = await getGlobalEvolution(dateFrom, dateTo, filters);

  return {
    asOf: d1 || null,
    previousAsOf: d2 || null,
    global,
    byBu,
    rupture,
    seuilBas,
    topStock,
    topDrops: drops,
    topGains: gains,
    evolution,
  };
}

module.exports = {
  upsertEntry, listEntries, getEntry, deleteEntry, businessUnitsVisibleTo, getDaySheet,
  getSeriesByBu, getSeriesByProduct, getDgDashboard,
};
