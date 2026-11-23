// Module QHSE — Lot 4. Routes des contrôles d'expédition. Lecture gatée sur `qhse.expeditions` ;
// saisie ≥ ajout ; clôture ≥ edition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.shipment.service');

const router = express.Router();
const SUB = 'qhse.expeditions';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listControls()); } catch (e) { next(e); }
});
router.get('/:id', requireRead, async (req, res, next) => {
  try {
    const c = await service.getControlDetail(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Introuvable.' });
    res.json(c);
  } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createControl(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id/checks', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveChecks(req.user, Number(req.params.id), (req.body && req.body.checks) || [])); }
  catch (e) { next(e); }
});
router.post('/:id/close', requireEdit, async (req, res, next) => {
  try { res.json(await service.closeControl(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

module.exports = router;
