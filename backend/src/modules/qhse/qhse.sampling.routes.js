// Module QHSE — Lot 2. Routes de l'échantillonnage en ligne. Lecture gatée sur `qhse.sampling` ;
// saisie des prélèvements ≥ ajout ; clôture ≥ edition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.sampling.service');

const router = express.Router();
const SUB = 'qhse.sampling';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listSamplings()); } catch (e) { next(e); }
});
router.get('/:id', requireRead, async (req, res, next) => {
  try {
    const s = await service.getSamplingDetail(Number(req.params.id));
    if (!s) return res.status(404).json({ error: 'Introuvable.' });
    res.json(s);
  } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createSampling(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id/items', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveItems(req.user, Number(req.params.id), (req.body && req.body.items) || [])); }
  catch (e) { next(e); }
});
router.post('/:id/close', requireEdit, async (req, res, next) => {
  try { res.json(await service.closeSampling(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

module.exports = router;
