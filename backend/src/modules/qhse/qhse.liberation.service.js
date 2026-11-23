// Module QHSE — Lot 3. Libération des lots. Décision Qualité tracée (historique) et appliquée
// transactionnellement sur stock_lots.statut_qualite. Jamais automatique : chaque décision est
// explicite et horodatée. Transverse BU (la Qualité statue sur tous les lots).
const { all, one, withTransaction } = require('../../db');

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

// Décision → valeur écrite dans stock_lots.statut_qualite.
const DECISION_STATUT = {
  libere: 'libere',
  bloque: 'bloque',
  rebut: 'rebut',
  derogation: 'derogation',
};

// Recherche de lots (par produit et/ou texte libre sur le n° de lot ou la désignation).
async function listLots(q, productId) {
  const where = []; const p = [];
  if (productId) { p.push(Number(productId)); where.push(`l.product_id = $${p.length}`); }
  if (q) { p.push(`%${q}%`); where.push(`(l.numero_lot ILIKE $${p.length} OR p.designation ILIKE $${p.length})`); }
  return all(
    `SELECT l.id, l.numero_lot, l.statut_qualite, l.date_fabrication, l.date_peremption,
            p.designation AS product_nom, bu.nom AS bu_nom
       FROM stock_lots l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN business_units bu ON bu.id = p.business_unit_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY l.created_at DESC LIMIT 100`, p);
}

async function getLotDetail(lotId) {
  const lot = await one(
    `SELECT l.*, p.designation AS product_nom, bu.nom AS bu_nom
       FROM stock_lots l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN business_units bu ON bu.id = p.business_unit_id
      WHERE l.id = $1`, [lotId]);
  if (!lot) return null;
  const history = await all(
    `SELECT r.*, n.numero AS nc_numero, u.prenom AS by_prenom, u.nom AS by_nom
       FROM qhse_lot_releases r
       LEFT JOIN qhse_nonconformities n ON n.id = r.nc_id
       LEFT JOIN users u ON u.id = r.created_by
      WHERE r.stock_lot_id = $1 ORDER BY r.created_at DESC`, [lotId]);
  return { ...lot, history };
}

// Décisions récentes (toutes lots confondus).
async function listReleases() {
  return all(
    `SELECT r.*, l.numero_lot, p.designation AS product_nom, n.numero AS nc_numero
       FROM qhse_lot_releases r
       LEFT JOIN stock_lots l ON l.id = r.stock_lot_id
       LEFT JOIN products p ON p.id = l.product_id
       LEFT JOIN qhse_nonconformities n ON n.id = r.nc_id
      ORDER BY r.created_at DESC LIMIT 200`);
}

// Enregistre une décision et met à jour le statut qualité du lot dans la même transaction.
async function createRelease(user, b) {
  if (!b.stock_lot_id) throw httpError(400, 'Lot requis.');
  const statut = DECISION_STATUT[b.decision];
  if (!statut) throw httpError(400, 'Décision invalide.');
  return withTransaction(async tx => {
    const lot = await tx.one('SELECT id FROM stock_lots WHERE id = $1', [b.stock_lot_id]);
    if (!lot) throw httpError(404, 'Lot introuvable.');
    const rel = await tx.one(
      `INSERT INTO qhse_lot_releases
         (stock_lot_id, decision, statut_qualite_applique, motif, decideur, date_decision, nc_id, analysis_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.stock_lot_id, b.decision, statut, b.motif || null, b.decideur || null,
        b.date_decision || null, b.nc_id || null, b.analysis_id || null, user.id]
    );
    await tx.run('UPDATE stock_lots SET statut_qualite = $1 WHERE id = $2', [statut, b.stock_lot_id]);
    return rel;
  });
}

module.exports = { listLots, getLotDetail, listReleases, createRelease, DECISION_STATUT };
