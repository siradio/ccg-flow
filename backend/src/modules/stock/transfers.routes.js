const express = require('express');
const { all, one, withTransaction } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite, canWriteBusinessUnit, visibleBusinessUnitIds } = require('../../middleware/permissions');

// Refonte Stock (Lot 3) — Transferts avec double validation. Expédition → sortie au départ ;
// réception → entrée à l'arrivée (via le grand livre). Écart = expédié − reçu.
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('stock.transferts');
const num = v => (v === '' || v === null || v === undefined ? null : Number(v));

// Crée un mouvement de grand livre dans la transaction courante et renvoie son id.
async function createLedger(tx, { typeCode, buId, locId, transferId, inventoryId, productId, qty, prix, userId, doc }) {
  const type = await tx.one('SELECT id, sens FROM stock_movement_types WHERE code = $1', [typeCode]);
  const m = await tx.one(
    `INSERT INTO stock_ledger (date_mouvement, type_id, business_unit_id, location_id, statut,
        reference_document, transfer_id, inventory_id, created_by, validated_by)
     VALUES (CURRENT_DATE,$1,$2,$3,'valide',$4,$5,$6,$7,$7) RETURNING id`,
    [type.id, buId, locId, doc || null, transferId || null, inventoryId || null, userId]);
  await tx.run('UPDATE stock_ledger SET reference = $1 WHERE id = $2', [`MV-${String(m.id).padStart(5, '0')}`, m.id]);
  const val = prix != null ? qty * prix : null;
  await tx.run('INSERT INTO stock_ledger_lines (movement_id, product_id, quantite, prix_unitaire, valeur) VALUES ($1,$2,$3,$4,$5)',
    [m.id, productId, qty, prix, val]);
  return m.id;
}

const HEADER = `
  SELECT t.*, bs.nom AS bu_source_nom, bd.nom AS bu_dest_nom,
         ls.nom AS loc_source_nom, ld.nom AS loc_dest_nom,
         u.prenom || ' ' || u.nom AS cree_par,
         (SELECT COUNT(*) FROM stock_transfer_lines l WHERE l.transfer_id = t.id)::int AS n_lignes
  FROM stock_transfers t
  LEFT JOIN business_units bs ON bs.id = t.business_unit_source
  LEFT JOIN business_units bd ON bd.id = t.business_unit_dest
  LEFT JOIN stock_locations ls ON ls.id = t.location_source_id
  LEFT JOIN stock_locations ld ON ld.id = t.location_dest_id
  LEFT JOIN users u ON u.id = t.created_by`;

router.get('/', requireSubModule('stock.transferts'), async (req, res, next) => {
  try {
    const where = []; const p = [];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); p.push(visible); where.push(`(t.business_unit_source = ANY($${p.length}) OR t.business_unit_dest = ANY($${p.length}))`); }
    if (req.query.statut) { p.push(req.query.statut); where.push(`t.statut = $${p.length}`); }
    res.json(await all(`${HEADER} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.date_transfert DESC, t.id DESC`, p));
  } catch (e) { next(e); }
});

router.get('/:id', requireSubModule('stock.transferts'), async (req, res, next) => {
  try {
    const t = await one(`${HEADER} WHERE t.id = $1`, [Number(req.params.id)]);
    if (!t) return res.status(404).json({ error: 'Transfert introuvable.' });
    // Cloisonnement BU : visible si la BU source OU destination est dans le périmètre de l'utilisateur.
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null && !(visible.includes(Number(t.business_unit_source)) || visible.includes(Number(t.business_unit_dest)))) {
      return res.status(404).json({ error: 'Transfert introuvable.' });
    }
    const lines = await all(
      `SELECT l.*, p.code AS product_code, p.designation, p.unite FROM stock_transfer_lines l
       JOIN products p ON p.id = l.product_id WHERE l.transfer_id = $1 ORDER BY l.id`, [t.id]);
    res.json({ ...t, lines });
  } catch (e) { next(e); }
});

router.post('/', requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    const buSource = num(b.business_unit_source);
    if (!buSource || !b.location_source_id || !b.location_dest_id) return res.status(400).json({ error: 'BU source et localisations source/destination requises.' });
    if (!canWriteBusinessUnit(req.user, buSource)) return res.status(403).json({ error: 'Accès BU source refusé.' });
    const lines = (b.lines || []).filter(l => l.product_id && Number(l.quantite_demandee) > 0);
    if (!lines.length) return res.status(400).json({ error: 'Au moins une ligne (produit + quantité) est requise.' });
    const id = await withTransaction(async (tx) => {
      const t = await tx.one(
        `INSERT INTO stock_transfers (date_transfert, business_unit_source, business_unit_dest,
            location_source_id, location_dest_id, transporteur, vehicule, chauffeur, commentaire, created_by)
         VALUES (COALESCE($1,CURRENT_DATE),$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [b.date_transfert || null, buSource, num(b.business_unit_dest) || buSource, Number(b.location_source_id),
         Number(b.location_dest_id), b.transporteur || null, b.vehicule || null, b.chauffeur || null, b.commentaire || null, req.user.id]);
      await tx.run('UPDATE stock_transfers SET reference = $1 WHERE id = $2', [`TR-${String(t.id).padStart(5, '0')}`, t.id]);
      for (const l of lines) {
        await tx.run('INSERT INTO stock_transfer_lines (transfer_id, product_id, lot_id, quantite_demandee) VALUES ($1,$2,$3,$4)',
          [t.id, Number(l.product_id), num(l.lot_id), Number(l.quantite_demandee)]);
      }
      return t.id;
    });
    res.status(201).json(await one(`${HEADER} WHERE t.id = $1`, [id]));
  } catch (e) { next(e); }
});

// Expédition : sortie du stock source. Body optionnel { quantites: {lineId: qty} } sinon = demandée.
router.post('/:id/expedier', requireEdit, async (req, res, next) => {
  try {
    const t = await one('SELECT * FROM stock_transfers WHERE id = $1', [Number(req.params.id)]);
    if (!t) return res.status(404).json({ error: 'Transfert introuvable.' });
    if (t.statut !== 'brouillon') return res.status(400).json({ error: 'Seul un transfert en brouillon peut être expédié.' });
    if (!canWriteBusinessUnit(req.user, t.business_unit_source)) return res.status(403).json({ error: 'Accès BU source refusé.' });
    const q = (req.body && req.body.quantites) || {};
    await withTransaction(async (tx) => {
      const lines = await tx.all('SELECT * FROM stock_transfer_lines WHERE transfer_id = $1', [t.id]);
      for (const l of lines) {
        const qty = q[l.id] != null ? Number(q[l.id]) : Number(l.quantite_demandee);
        await tx.run('UPDATE stock_transfer_lines SET quantite_expediee = $1 WHERE id = $2', [qty, l.id]);
        if (qty > 0) await createLedger(tx, { typeCode: 'transfert_sortie', buId: t.business_unit_source, locId: t.location_source_id, transferId: t.id, productId: l.product_id, qty, userId: req.user.id, doc: t.reference });
      }
      await tx.run("UPDATE stock_transfers SET statut = 'expedie', expedie_by = $1, expedie_le = now() WHERE id = $2", [req.user.id, t.id]);
    });
    res.json(await one(`${HEADER} WHERE t.id = $1`, [t.id]));
  } catch (e) { next(e); }
});

// Réception : entrée au stock destination. Body { quantites: {lineId: qtyRecue} } sinon = expédiée.
router.post('/:id/receptionner', requireEdit, async (req, res, next) => {
  try {
    const t = await one('SELECT * FROM stock_transfers WHERE id = $1', [Number(req.params.id)]);
    if (!t) return res.status(404).json({ error: 'Transfert introuvable.' });
    if (t.statut !== 'expedie') return res.status(400).json({ error: 'Seul un transfert expédié peut être réceptionné.' });
    if (!canWriteBusinessUnit(req.user, t.business_unit_dest)) return res.status(403).json({ error: 'Accès BU destination refusé.' });
    const q = (req.body && req.body.quantites) || {};
    await withTransaction(async (tx) => {
      const lines = await tx.all('SELECT * FROM stock_transfer_lines WHERE transfer_id = $1', [t.id]);
      for (const l of lines) {
        const qty = q[l.id] != null ? Number(q[l.id]) : Number(l.quantite_expediee || 0);
        await tx.run('UPDATE stock_transfer_lines SET quantite_recue = $1 WHERE id = $2', [qty, l.id]);
        if (qty > 0) await createLedger(tx, { typeCode: 'transfert_entree', buId: t.business_unit_dest, locId: t.location_dest_id, transferId: t.id, productId: l.product_id, qty, userId: req.user.id, doc: t.reference });
      }
      await tx.run("UPDATE stock_transfers SET statut = 'recu', recu_by = $1, recu_le = now() WHERE id = $2", [req.user.id, t.id]);
    });
    res.json(await one(`${HEADER} WHERE t.id = $1`, [t.id]));
  } catch (e) { next(e); }
});

router.post('/:id/annuler', requireEdit, async (req, res, next) => {
  try {
    const t = await one('SELECT * FROM stock_transfers WHERE id = $1', [Number(req.params.id)]);
    if (!t) return res.status(404).json({ error: 'Transfert introuvable.' });
    if (t.statut !== 'brouillon') return res.status(400).json({ error: 'Seul un transfert en brouillon peut être annulé.' });
    await one("UPDATE stock_transfers SET statut = 'annule' WHERE id = $1 RETURNING id", [t.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
