const express = require('express');
const { all, one } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite, requireSuperAdmin, visibleBusinessUnitIds } = require('../../middleware/permissions');
const settings = require('../settings/settings.service');
const peremptionAlerts = require('./peremption-alerts');

// Refonte Stock (Lot 2) — Lots & péremption. Quantité restante dérivée (vue v_stock_lot_balances).
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate } = requireSubModuleWrite('stock.consultation');
const num = v => (v === '' || v === null || v === undefined ? null : Number(v));

const SELECT = `
  SELECT l.*, p.code AS product_code, p.designation, p.unite, p.business_unit_id, bu.nom AS bu_nom,
         loc.nom AS location_nom, COALESCE(b.quantite_restante, 0) AS quantite_restante,
         (l.date_peremption IS NOT NULL AND l.date_peremption < CURRENT_DATE) AS perime,
         (l.date_peremption - CURRENT_DATE) AS jours_avant_peremption
  FROM stock_lots l
  JOIN products p ON p.id = l.product_id
  LEFT JOIN business_units bu ON bu.id = p.business_unit_id
  LEFT JOIN stock_locations loc ON loc.id = l.location_id
  LEFT JOIN v_stock_lot_balances b ON b.lot_id = l.id`;

// Liste des lots (scopée BU), filtrable par produit / BU.
router.get('/', requireSubModule('stock.consultation'), async (req, res, next) => {
  try {
    const where = []; const p = [];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); p.push(visible); where.push(`p.business_unit_id = ANY($${p.length})`); }
    if (req.query.product_id) { p.push(Number(req.query.product_id)); where.push(`l.product_id = $${p.length}`); }
    if (req.query.business_unit_id) { p.push(Number(req.query.business_unit_id)); where.push(`p.business_unit_id = $${p.length}`); }
    res.json(await all(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.date_peremption NULLS LAST, p.designation`, p));
  } catch (e) { next(e); }
});

// FEFO : lots disponibles (quantité restante > 0) d'un produit, du plus proche périmé au plus lointain.
router.get('/available', requireSubModule('stock.consultation'), async (req, res, next) => {
  try {
    if (!req.query.product_id) return res.status(400).json({ error: 'product_id requis.' });
    const p = [Number(req.query.product_id)];
    // Cloisonnement BU : un utilisateur restreint ne voit que les lots des produits de ses BU.
    let buClause = '';
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); p.push(visible); buClause = `AND p.business_unit_id = ANY($${p.length})`; }
    let locClause = '';
    if (req.query.location_id) { p.push(Number(req.query.location_id)); locClause = `AND l.location_id = $${p.length}`; }
    res.json(await all(
      `${SELECT} WHERE l.product_id = $1 ${buClause} ${locClause} AND COALESCE(b.quantite_restante,0) > 0
       ORDER BY l.date_peremption NULLS LAST, l.id`, p));
  } catch (e) { next(e); }
});

// Lots proches de la péremption (ou périmés) dans les `jours` prochains jours.
router.get('/echeances', requireSubModule('stock.consultation'), async (req, res, next) => {
  try {
    const jours = Number(req.query.jours) || 30;
    const where = [`l.date_peremption IS NOT NULL`, `l.date_peremption <= CURRENT_DATE + ($1 || ' days')::interval`, `COALESCE(b.quantite_restante,0) > 0`];
    const p = [String(jours)];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible !== null) { if (!visible.length) return res.json([]); p.push(visible); where.push(`p.business_unit_id = ANY($${p.length})`); }
    res.json(await all(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY l.date_peremption`, p));
  } catch (e) { next(e); }
});

// Création manuelle d'un lot (aussi créé automatiquement à la réception, via /stock-mouvements).
router.post('/', requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.product_id || !b.numero_lot) return res.status(400).json({ error: 'Produit et numéro de lot requis.' });
    const row = await one(
      `INSERT INTO stock_lots (product_id, numero_lot, date_fabrication, date_reception, date_peremption,
         quantite_initiale, fournisseur_id, location_id, statut_qualite, commentaire, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [Number(b.product_id), b.numero_lot, b.date_fabrication || null, b.date_reception || null, b.date_peremption || null,
       num(b.quantite_initiale), num(b.fournisseur_id), num(b.location_id), b.statut_qualite || null, b.commentaire || null, req.user.id]);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// Configuration des alertes de péremption par email (super_admin).
router.get('/alert-config', requireSuperAdmin, async (req, res, next) => {
  try {
    res.json({
      actif: String(await settings.getValue('peremption_alert_actif', 'false')) === 'true',
      jours: await settings.getIntValue('peremption_alert_jours', 30),
      emails: await settings.getValue('peremption_alert_emails', ''),
    });
  } catch (e) { next(e); }
});

router.put('/alert-config', requireSuperAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.actif !== undefined) await settings.setValue('peremption_alert_actif', b.actif ? 'true' : 'false');
    if (b.jours !== undefined) await settings.setValue('peremption_alert_jours', String(Number(b.jours) || 30));
    if (b.emails !== undefined) await settings.setValue('peremption_alert_emails', String(b.emails || ''));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Envoi immédiat de l'alerte aux destinataires configurés (« Envoyer maintenant »).
router.post('/alert-config/test', requireSuperAdmin, async (req, res, next) => {
  try {
    const { jours, emails } = await peremptionAlerts.getConfig();
    if (!emails.length) return res.status(400).json({ error: 'Aucun destinataire configuré.' });
    const r = await peremptionAlerts.sendDigestTo(emails, jours);
    res.json(r);
  } catch (e) { next(e); }
});

module.exports = router;
