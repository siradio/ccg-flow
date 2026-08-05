const express = require('express');
const { all } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, visibleBusinessUnitIds } = require('../../middleware/permissions');

// Refonte Stock (Lot 1) — Stock actuel : solde DÉRIVÉ du grand livre (vue v_stock_balances) croisé
// avec le référentiel produit (seuils, unité) et la localisation. Le statut est calculé à la volée.
const router = express.Router();
router.use(requireAuth);

function computeStatut(stock, seuilMin, seuilSecurite, seuilMax) {
  const s = Number(stock);
  if (s <= 0) return 'Rupture';
  if (seuilSecurite != null && s <= Number(seuilSecurite)) return 'Critique';
  if (seuilMin != null && s < Number(seuilMin)) return 'Alerte';
  if (seuilMax != null && s > Number(seuilMax)) return 'Surstock';
  return 'OK';
}

router.get('/', requireSubModule('stock.consultation'), async (req, res, next) => {
  try {
    const where = []; const p = [];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); p.push(visible); where.push(`p.business_unit_id = ANY($${p.length})`); }
    for (const [q, col] of [['business_unit_id', 'p.business_unit_id'], ['location_id', 'b.location_id'], ['category_id', 'p.category_id'], ['product_id', 'p.id']]) {
      if (req.query[q]) { p.push(Number(req.query[q])); where.push(`${col} = $${p.length}`); }
    }
    const rows = await all(
      `SELECT p.id AS product_id, p.code AS product_code, p.designation, p.unite, p.type_article,
              p.business_unit_id, bu.nom AS bu_nom, b.location_id, loc.nom AS location_nom,
              pc.nom AS categorie,
              COALESCE(b.stock_actuel, 0)  AS stock_actuel,
              COALESCE(b.total_entrees, 0) AS total_entrees,
              COALESCE(b.total_sorties, 0) AS total_sorties,
              COALESCE(b.valeur_flux, 0)   AS valeur_flux,
              p.seuil_alerte_stock, p.stock_securite, p.seuil_max,
              COALESCE(p.cout_standard, p.cout_moyen_pondere, p.prix_suggere_gnf) AS cout_unitaire
       FROM v_stock_balances b
       JOIN products p ON p.id = b.product_id
       LEFT JOIN business_units bu ON bu.id = p.business_unit_id
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN stock_locations loc ON loc.id = b.location_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY p.designation, loc.nom`, p);
    res.json(rows.map(r => {
      const cout = r.cout_unitaire != null ? Number(r.cout_unitaire) : null;
      return {
        ...r,
        statut: computeStatut(r.stock_actuel, r.seuil_alerte_stock, r.stock_securite, r.seuil_max),
        valeur_stock: cout != null ? Number(r.stock_actuel) * cout : null,
      };
    }));
  } catch (e) { next(e); }
});

module.exports = router;
