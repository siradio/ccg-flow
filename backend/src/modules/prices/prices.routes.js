const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const service = require('./prices.service');

const router = express.Router();
router.use(requireAuth);
router.use(requireSubModule('referentiels.prix'));

router.get('/current', async (req, res, next) => {
  try {
    const { business_unit_id, category_id } = req.query;
    res.json(await service.getCurrentPrices(req.user, {
      businessUnitId: business_unit_id ? Number(business_unit_id) : null,
      categoryId: category_id ? Number(category_id) : null,
    }));
  } catch (e) { next(e); }
});

router.get('/history', async (req, res, next) => {
  try {
    const { date_from, date_to, business_unit_id, category_id, product_id } = req.query;
    res.json(await service.listPrices(req.user, {
      dateFrom: date_from,
      dateTo: date_to,
      businessUnitId: business_unit_id ? Number(business_unit_id) : null,
      categoryId: category_id ? Number(category_id) : null,
      productId: product_id ? Number(product_id) : null,
    }));
  } catch (e) { next(e); }
});

router.get('/series', async (req, res, next) => {
  try {
    const { product_id, date_from, date_to } = req.query;
    res.json(await service.getPriceSeries(req.user, {
      productId: product_id ? Number(product_id) : null,
      dateFrom: date_from,
      dateTo: date_to,
    }));
  } catch (e) { next(e); }
});

router.post('/', requireSubModule('referentiels.prix', 'ajout'), async (req, res, next) => {
  try {
    const { productId, prix, devise, dateEffet, commentaire } = req.body || {};
    const price = await service.addPrice(req.user, { productId, prix, devise, dateEffet, commentaire });
    res.status(201).json(price);
  } catch (e) { next(e); }
});

// Correction/suppression d'une ligne d'historique déjà saisie — réservé au niveau "edition"
// (§3.8) : le niveau "ajout" ci-dessus ne permet que d'AJOUTER un nouveau changement de prix.
router.put('/:id', requireSubModule('referentiels.prix', 'edition'), async (req, res, next) => {
  try {
    const { prix, devise, dateEffet, commentaire } = req.body || {};
    res.json(await service.updatePrice(Number(req.params.id), { prix, devise, dateEffet, commentaire }));
  } catch (e) { next(e); }
});

router.delete('/:id', requireSubModule('referentiels.prix', 'edition'), async (req, res, next) => {
  try {
    await service.deletePrice(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
