const express = require('express');
const { all, one, withTransaction } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite, canWriteBusinessUnit, visibleBusinessUnitIds } = require('../../middleware/permissions');

// Refonte Stock (Lot 1) — Grand livre de mouvements. Source de vérité du stock (le solde se dérive,
// voir stock-actuel). Saisie = quantité TOUJOURS positive ; le sens du type porte le signe.
// Une écriture validée n'est jamais supprimée : on l'ANNULE (sort du solde, reste dans l'historique).
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('stock.saisie');
const num = v => (v === '' || v === null || v === undefined ? null : Number(v));

// Liste filtrée (consultation), scopée par BU.
router.get('/', requireSubModule('stock.consultation'), async (req, res, next) => {
  try {
    const where = []; const p = [];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); p.push(visible); where.push(`m.business_unit_id = ANY($${p.length})`); }
    for (const [q, col] of [['business_unit_id', 'm.business_unit_id'], ['type_id', 'm.type_id'], ['location_id', 'm.location_id'], ['statut', 'm.statut']]) {
      if (req.query[q]) { p.push(req.query[q]); where.push(`${col} = $${p.length}`); }
    }
    if (req.query.date_from) { p.push(req.query.date_from); where.push(`m.date_mouvement >= $${p.length}`); }
    if (req.query.date_to) { p.push(req.query.date_to); where.push(`m.date_mouvement <= $${p.length}`); }
    if (req.query.product_id) { p.push(Number(req.query.product_id)); where.push(`EXISTS (SELECT 1 FROM stock_ledger_lines l WHERE l.movement_id = m.id AND l.product_id = $${p.length})`); }
    res.json(await all(
      `SELECT m.id, m.reference, m.date_mouvement, m.statut, m.commentaire, m.reference_document, m.numero_bon,
              t.libelle AS type_libelle, t.sens, bu.nom AS bu_nom, loc.nom AS location_nom,
              (SELECT COUNT(*) FROM stock_ledger_lines l WHERE l.movement_id = m.id)::int AS n_lignes,
              (SELECT COALESCE(SUM(l.quantite),0) FROM stock_ledger_lines l WHERE l.movement_id = m.id) AS total_quantite,
              u.prenom || ' ' || u.nom AS cree_par
       FROM stock_ledger m
       JOIN stock_movement_types t ON t.id = m.type_id
       LEFT JOIN business_units bu ON bu.id = m.business_unit_id
       LEFT JOIN stock_locations loc ON loc.id = m.location_id
       LEFT JOIN users u ON u.id = m.created_by
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY m.date_mouvement DESC, m.id DESC LIMIT 500`, p));
  } catch (e) { next(e); }
});

router.get('/:id', requireSubModule('stock.consultation'), async (req, res, next) => {
  try {
    const m = await one(
      `SELECT m.*, t.libelle AS type_libelle, t.sens, bu.nom AS bu_nom, loc.nom AS location_nom,
              pf.designation AS produit_fini_designation,
              u.prenom || ' ' || u.nom AS cree_par, v.prenom || ' ' || v.nom AS valide_par
       FROM stock_ledger m JOIN stock_movement_types t ON t.id = m.type_id
       LEFT JOIN business_units bu ON bu.id = m.business_unit_id
       LEFT JOIN stock_locations loc ON loc.id = m.location_id
       LEFT JOIN products pf ON pf.id = m.produit_fini_id
       LEFT JOIN users u ON u.id = m.created_by LEFT JOIN users v ON v.id = m.validated_by
       WHERE m.id = $1`, [Number(req.params.id)]);
    if (!m) return res.status(404).json({ error: 'Mouvement introuvable.' });
    const lines = await all(
      `SELECT l.id, l.product_id, l.quantite, l.prix_unitaire, l.valeur, p.code AS product_code, p.designation, p.unite
       FROM stock_ledger_lines l JOIN products p ON p.id = l.product_id WHERE l.movement_id = $1 ORDER BY l.id`, [m.id]);
    res.json({ ...m, lines });
  } catch (e) { next(e); }
});

// Création : en-tête + lignes, atomique. Quantité positive obligatoire ; le type porte le signe.
router.post('/', requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    const buId = num(b.business_unit_id);
    if (!b.type_id) return res.status(400).json({ error: 'Type de mouvement requis.' });
    if (!buId) return res.status(400).json({ error: 'Business Unit requise.' });
    if (!canWriteBusinessUnit(req.user, buId)) return res.status(403).json({ error: "Vous n'avez pas l'accès en écriture sur cette Business Unit." });
    const lines = Array.isArray(b.lines) && b.lines.length ? b.lines
      : (b.product_id ? [{ product_id: b.product_id, quantite: b.quantite, prix_unitaire: b.prix_unitaire, lot_id: b.lot_id, lot: b.lot }] : []);
    if (!lines.length) return res.status(400).json({ error: 'Au moins une ligne (produit + quantité) est requise.' });
    for (const l of lines) {
      if (!l.product_id) return res.status(400).json({ error: 'Produit requis sur chaque ligne.' });
      if (!(Number(l.quantite) > 0)) return res.status(400).json({ error: 'La quantité doit être strictement positive.' });
    }
    const result = await withTransaction(async (tx) => {
      const m = await tx.one(
        `INSERT INTO stock_ledger (date_mouvement, type_id, business_unit_id, location_id, statut,
            reference_document, numero_bon, fournisseur_id, commentaire,
            ordre_fabrication, ligne_production, produit_fini_id, lot_fournisseur, statut_qualite,
            created_by, validated_by)
         VALUES (COALESCE($1, CURRENT_DATE),$2,$3,$4,'valide',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING *`,
        [b.date_mouvement || null, Number(b.type_id), buId, num(b.location_id),
         b.reference_document || null, b.numero_bon || null, num(b.fournisseur_id), b.commentaire || null,
         b.ordre_fabrication || null, b.ligne_production || null, num(b.produit_fini_id),
         b.lot_fournisseur || null, b.statut_qualite || null, req.user.id]);
      await tx.run(`UPDATE stock_ledger SET reference = $1 WHERE id = $2`, [`MV-${String(m.id).padStart(5, '0')}`, m.id]);
      const type = await tx.one('SELECT sens FROM stock_movement_types WHERE id = $1', [Number(b.type_id)]);
      for (const l of lines) {
        const pid = Number(l.product_id);
        const qty = Number(l.quantite);
        const pu = num(l.prix_unitaire);
        const val = pu != null ? qty * pu : null;
        // Lot : soit un lot existant (sortie FEFO), soit un nouveau lot à créer (réception).
        let lotId = num(l.lot_id);
        if (!lotId && l.lot && l.lot.numero_lot) {
          const nl = await tx.one(
            `INSERT INTO stock_lots (product_id, numero_lot, date_fabrication, date_peremption, date_reception,
               quantite_initiale, location_id, created_by)
             VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,$8) RETURNING id`,
            [pid, l.lot.numero_lot, l.lot.date_fabrication || null, l.lot.date_peremption || null,
             l.lot.date_reception || null, qty, num(b.location_id), req.user.id]);
          lotId = nl.id;
        }
        // Valorisation CMP : mise à jour du coût moyen pondéré à chaque entrée valorisée (calcul
        // AVANT insertion de la ligne pour utiliser le stock antérieur).
        if (type && type.sens === 'entree' && pu != null) {
          const oldQtyRow = await tx.one(
            `SELECT COALESCE(SUM(CASE t.sens WHEN 'entree' THEN ml.quantite WHEN 'sortie' THEN -ml.quantite ELSE 0 END),0) AS qty
             FROM stock_ledger_lines ml JOIN stock_ledger mm ON mm.id = ml.movement_id
             JOIN stock_movement_types t ON t.id = mm.type_id
             WHERE ml.product_id = $1 AND mm.statut = 'valide'`, [pid]);
          const oldQty = Number(oldQtyRow.qty);
          const prow = await tx.one('SELECT cout_moyen_pondere, cout_standard FROM products WHERE id = $1', [pid]);
          const oldCMP = Number(prow.cout_moyen_pondere ?? prow.cout_standard ?? pu);
          const newCMP = oldQty > 0 ? (oldQty * oldCMP + qty * pu) / (oldQty + qty) : pu;
          await tx.run('UPDATE products SET cout_moyen_pondere = $1 WHERE id = $2', [newCMP, pid]);
        }
        await tx.run(
          `INSERT INTO stock_ledger_lines (movement_id, product_id, quantite, lot_id, prix_unitaire, valeur)
           VALUES ($1,$2,$3,$4,$5,$6)`, [m.id, pid, qty, lotId, pu, val]);
      }
      return m.id;
    });
    res.status(201).json(await one(`SELECT * FROM stock_ledger WHERE id = $1`, [result]));
  } catch (e) { next(e); }
});

// Annulation (pas de suppression) : le mouvement sort du solde mais reste dans l'historique.
router.post('/:id/annuler', requireEdit, async (req, res, next) => {
  try {
    const m = await one('SELECT * FROM stock_ledger WHERE id = $1', [Number(req.params.id)]);
    if (!m) return res.status(404).json({ error: 'Mouvement introuvable.' });
    if (m.statut === 'annule') return res.status(400).json({ error: 'Mouvement déjà annulé.' });
    if (!canWriteBusinessUnit(req.user, m.business_unit_id)) return res.status(403).json({ error: 'Accès BU refusé.' });
    const row = await one(`UPDATE stock_ledger SET statut = 'annule' WHERE id = $1 RETURNING *`, [m.id]);
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/:id', requireEdit, (req, res) =>
  res.status(405).json({ error: "Un mouvement validé ne se supprime pas : utilisez l'annulation (traçabilité)." }));

module.exports = router;
