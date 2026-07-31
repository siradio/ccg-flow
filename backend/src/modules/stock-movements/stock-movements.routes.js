const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const service = require('./stock-movements.service');

const router = express.Router();
router.use(requireAuth);
// Sous-module indépendant de Stock du Jour (§2.3/§3.9 SPEC.md) : accordable séparément depuis la
// refonte du système de permissions — un utilisateur peut avoir Mouvement Stock sans Stock du
// Jour, ou l'inverse. L'accès par Business Unit (canWriteBusinessUnit/visibleBusinessUnitIds)
// continue de s'appliquer uniformément aux deux sous-modules stock, quel que soit lequel a été
// accordé.
router.use(requireSubModule('stock.mouvements'));

router.get('/', async (req, res, next) => {
  try {
    const { date_from, date_to, business_unit_id, product_id, type_mouvement } = req.query;
    res.json(await service.listMovements(req.user, {
      dateFrom: date_from,
      dateTo: date_to,
      businessUnitId: business_unit_id ? Number(business_unit_id) : null,
      productId: product_id ? Number(product_id) : null,
      typeMouvement: type_mouvement || null,
    }));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { productId, typeMouvement, quantite, dateMouvement, motif, referenceDocument } = req.body || {};
    const movement = await service.addMovement(req.user, { productId, typeMouvement, quantite, dateMouvement, motif, referenceDocument });
    res.status(201).json(movement);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await service.deleteMovement(req.user, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
