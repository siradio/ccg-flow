const express = require('express');
const { all, one, withTransaction } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite, canWriteBusinessUnit, visibleBusinessUnitIds } = require('../../middleware/permissions');

// Refonte Stock (Lot 3) — Inventaires physiques. À la création, le stock théorique est figé depuis
// le solde dérivé. La saisie du physique calcule l'écart ; la validation génère les mouvements
// d'ajustement (positif / négatif) pour réaligner le grand livre.
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('stock.inventaires');
const num = v => (v === '' || v === null || v === undefined ? null : Number(v));

async function createAdjustment(tx, { typeCode, buId, locId, inventoryId, productId, qty, userId, doc }) {
  const type = await tx.one('SELECT id FROM stock_movement_types WHERE code = $1', [typeCode]);
  const m = await tx.one(
    `INSERT INTO stock_ledger (date_mouvement, type_id, business_unit_id, location_id, statut, reference_document, inventory_id, created_by, validated_by)
     VALUES (CURRENT_DATE,$1,$2,$3,'valide',$4,$5,$6,$6) RETURNING id`,
    [type.id, buId, locId, doc || null, inventoryId, userId]);
  await tx.run('UPDATE stock_ledger SET reference = $1 WHERE id = $2', [`MV-${String(m.id).padStart(5, '0')}`, m.id]);
  await tx.run('INSERT INTO stock_ledger_lines (movement_id, product_id, quantite) VALUES ($1,$2,$3)', [m.id, productId, qty]);
}

const HEADER = `
  SELECT i.*, bu.nom AS bu_nom, loc.nom AS location_nom, u.prenom || ' ' || u.nom AS cree_par,
         (SELECT COUNT(*) FROM stock_inventory_lines l WHERE l.inventory_id = i.id)::int AS n_lignes
  FROM stock_inventories i
  LEFT JOIN business_units bu ON bu.id = i.business_unit_id
  LEFT JOIN stock_locations loc ON loc.id = i.location_id
  LEFT JOIN users u ON u.id = i.created_by`;

router.get('/', requireSubModule('stock.inventaires'), async (req, res, next) => {
  try {
    const where = []; const p = [];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); p.push(visible); where.push(`i.business_unit_id = ANY($${p.length})`); }
    res.json(await all(`${HEADER} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.date_inventaire DESC, i.id DESC`, p));
  } catch (e) { next(e); }
});

router.get('/:id', requireSubModule('stock.inventaires'), async (req, res, next) => {
  try {
    const i = await one(`${HEADER} WHERE i.id = $1`, [Number(req.params.id)]);
    if (!i) return res.status(404).json({ error: 'Inventaire introuvable.' });
    // Cloisonnement BU : un utilisateur restreint ne peut pas lire un inventaire d'une autre BU.
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null && !visible.includes(Number(i.business_unit_id))) return res.status(404).json({ error: 'Inventaire introuvable.' });
    const lines = await all(
      `SELECT l.*, p.code AS product_code, p.designation, p.unite,
              COALESCE(l.stock_physique,0) - l.stock_theorique AS ecart
       FROM stock_inventory_lines l JOIN products p ON p.id = l.product_id
       WHERE l.inventory_id = $1 ORDER BY p.designation`, [i.id]);
    res.json({ ...i, lines });
  } catch (e) { next(e); }
});

// Création : fige le stock théorique de chaque produit ayant du solde à cette localisation.
router.post('/', requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    const buId = num(b.business_unit_id);
    if (!buId || !b.location_id) return res.status(400).json({ error: 'Business Unit et localisation requises.' });
    if (!canWriteBusinessUnit(req.user, buId)) return res.status(403).json({ error: 'Accès BU refusé.' });
    const id = await withTransaction(async (tx) => {
      const inv = await tx.one(
        `INSERT INTO stock_inventories (date_inventaire, business_unit_id, location_id, commentaire, created_by)
         VALUES (COALESCE($1,CURRENT_DATE),$2,$3,$4,$5) RETURNING id`,
        [b.date_inventaire || null, buId, Number(b.location_id), b.commentaire || null, req.user.id]);
      await tx.run('UPDATE stock_inventories SET reference = $1 WHERE id = $2', [`INV-${String(inv.id).padStart(5, '0')}`, inv.id]);
      // Snapshot du théorique = solde dérivé par produit à cette localisation.
      const snap = await tx.all(
        `SELECT bal.product_id, bal.stock_actuel FROM v_stock_balances bal
         JOIN products p ON p.id = bal.product_id
         WHERE bal.location_id = $1 AND p.business_unit_id = $2`, [Number(b.location_id), buId]);
      for (const s of snap) {
        await tx.run('INSERT INTO stock_inventory_lines (inventory_id, product_id, stock_theorique) VALUES ($1,$2,$3)',
          [inv.id, s.product_id, Number(s.stock_actuel)]);
      }
      return inv.id;
    });
    res.status(201).json(await one(`${HEADER} WHERE i.id = $1`, [id]));
  } catch (e) { next(e); }
});

// Saisie du stock physique + motifs.
router.put('/:id/lines', requireEdit, async (req, res, next) => {
  try {
    const inv = await one('SELECT * FROM stock_inventories WHERE id = $1', [Number(req.params.id)]);
    if (!inv) return res.status(404).json({ error: 'Inventaire introuvable.' });
    if (inv.statut !== 'en_cours') return res.status(400).json({ error: 'Inventaire déjà clôturé.' });
    for (const l of (req.body.lines || [])) {
      await one('UPDATE stock_inventory_lines SET stock_physique = $1, motif = $2 WHERE id = $3 AND inventory_id = $4 RETURNING id',
        [num(l.stock_physique), l.motif || null, Number(l.id), inv.id]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Validation : génère les ajustements pour chaque écart non nul, puis clôture.
router.post('/:id/valider', requireEdit, async (req, res, next) => {
  try {
    const inv = await one('SELECT * FROM stock_inventories WHERE id = $1', [Number(req.params.id)]);
    if (!inv) return res.status(404).json({ error: 'Inventaire introuvable.' });
    if (inv.statut !== 'en_cours') return res.status(400).json({ error: 'Inventaire déjà clôturé.' });
    if (!canWriteBusinessUnit(req.user, inv.business_unit_id)) return res.status(403).json({ error: 'Accès BU refusé.' });
    const result = await withTransaction(async (tx) => {
      const lines = await tx.all('SELECT * FROM stock_inventory_lines WHERE inventory_id = $1 AND stock_physique IS NOT NULL', [inv.id]);
      let nbAjust = 0;
      for (const l of lines) {
        const ecart = Number(l.stock_physique) - Number(l.stock_theorique);
        if (ecart === 0) continue;
        await createAdjustment(tx, {
          typeCode: ecart > 0 ? 'ajustement_positif' : 'ajustement_negatif',
          buId: inv.business_unit_id, locId: inv.location_id, inventoryId: inv.id,
          productId: l.product_id, qty: Math.abs(ecart), userId: req.user.id, doc: inv.reference,
        });
        nbAjust++;
      }
      await tx.run("UPDATE stock_inventories SET statut = 'valide', validated_by = $1, validated_le = now() WHERE id = $2", [req.user.id, inv.id]);
      return nbAjust;
    });
    res.json({ ok: true, ajustements: result });
  } catch (e) { next(e); }
});

router.post('/:id/annuler', requireEdit, async (req, res, next) => {
  try {
    const inv = await one('SELECT * FROM stock_inventories WHERE id = $1', [Number(req.params.id)]);
    if (!inv) return res.status(404).json({ error: 'Inventaire introuvable.' });
    if (inv.statut !== 'en_cours') return res.status(400).json({ error: 'Inventaire déjà clôturé.' });
    await one("UPDATE stock_inventories SET statut = 'annule' WHERE id = $1 RETURNING id", [inv.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
