const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, hasSubModuleLevel } = require('../../middleware/permissions');
const service = require('./stock.service');

const router = express.Router();
router.use(requireAuth);

// Utilitaire partagé par Stock du Jour ET Mouvement Stock (menu déroulant des deux écrans) —
// accessible dès qu'on a l'un des deux sous-modules, pas seulement Stock du Jour.
router.get('/business-units', async (req, res, next) => {
  if (!hasSubModuleLevel(req.user, 'stock.saisie_jour') && !hasSubModuleLevel(req.user, 'stock.mouvements')) {
    return res.status(403).json({ error: 'Accès refusé.' });
  }
  try { res.json(await service.businessUnitsVisibleTo(req.user)); }
  catch (e) { next(e); }
});

// Le reste de ce routeur est spécifique à Stock du Jour (§2.3/§3.9 SPEC.md) — Mouvement Stock a
// son propre routeur (stock-movements.routes.js) et son propre sous-module.
router.use(requireSubModule('stock.saisie_jour'));

router.get('/day', async (req, res, next) => {
  try {
    const { date, business_unit_id } = req.query;
    res.json(await service.getDaySheet(req.user, { dateStock: date, businessUnitId: business_unit_id ? Number(business_unit_id) : null }));
  } catch (e) { next(e); }
});

router.get('/entries', async (req, res, next) => {
  try {
    const { date, date_from, date_to, business_unit_id, product_id } = req.query;
    res.json(await service.listEntries(req.user, {
      dateStock: date,
      dateFrom: date_from,
      dateTo: date_to,
      businessUnitId: business_unit_id ? Number(business_unit_id) : null,
      productId: product_id ? Number(product_id) : null,
    }));
  } catch (e) { next(e); }
});

router.get('/entries/:id', async (req, res, next) => {
  try {
    const entry = await service.getEntry(req.user, Number(req.params.id));
    if (!entry) return res.status(404).json({ error: 'Saisie introuvable.' });
    res.json(entry);
  } catch (e) { next(e); }
});

router.post('/entries', async (req, res, next) => {
  try {
    const { date, productId, quantite, unite, commentaire } = req.body || {};
    const entry = await service.upsertEntry(req.user, { dateStock: date, productId, quantite, unite, commentaire });
    res.status(201).json(entry);
  } catch (e) { next(e); }
});

router.delete('/entries/:id', async (req, res, next) => {
  try {
    await service.deleteEntry(req.user, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/series/by-bu', async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    res.json(await service.getSeriesByBu(req.user, { dateFrom: date_from, dateTo: date_to }));
  } catch (e) { next(e); }
});

router.get('/series/by-product', async (req, res, next) => {
  try {
    const { product_id, date_from, date_to } = req.query;
    res.json(await service.getSeriesByProduct(req.user, {
      productId: product_id ? Number(product_id) : null,
      dateFrom: date_from,
      dateTo: date_to,
    }));
  } catch (e) { next(e); }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const { date_from, date_to, business_unit_id, category_id, product_id } = req.query;
    res.json(await service.getDgDashboard(req.user, {
      dateFrom: date_from,
      dateTo: date_to,
      businessUnitId: business_unit_id ? Number(business_unit_id) : null,
      categoryId: category_id ? Number(category_id) : null,
      productId: product_id ? Number(product_id) : null,
    }));
  } catch (e) { next(e); }
});

module.exports = router;
