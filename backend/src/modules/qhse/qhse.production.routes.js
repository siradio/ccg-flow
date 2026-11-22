// Module QHSE — Lot 2. Routes des contrôles de production. Lecture gatée sur `qhse.production` ;
// saisie des relevés ≥ ajout ; clôture ≥ edition (séparation saisie / clôture).
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.production.service');

const router = express.Router();
const SUB = 'qhse.production';
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
router.put('/:id/readings', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveReadings(req.user, Number(req.params.id), (req.body && req.body.readings) || [])); }
  catch (e) { next(e); }
});
router.post('/:id/close', requireEdit, async (req, res, next) => {
  try { res.json(await service.closeControl(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

module.exports = router;
