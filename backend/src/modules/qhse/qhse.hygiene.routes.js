// Module QHSE — Volet Hygiène. Routes des inspections. Lecture gatée sur `qhse.hygiene` ;
// saisie (en-tête, relevés) ≥ ajout ; clôture ≥ édition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.hygiene.service');

const router = express.Router();
const SUB = 'qhse.hygiene';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listInspections()); } catch (e) { next(e); }
});
router.get('/:id', requireRead, async (req, res, next) => {
  try {
    const i = await service.getInspectionDetail(Number(req.params.id));
    if (!i) return res.status(404).json({ error: 'Introuvable.' });
    res.json(i);
  } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createInspection(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', requireCreate, async (req, res, next) => {
  try { res.json(await service.updateInspection(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.put('/:id/results', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveResults(req.user, Number(req.params.id), (req.body && req.body.results) || [])); } catch (e) { next(e); }
});
router.post('/:id/close', requireEdit, async (req, res, next) => {
  try { res.json(await service.closeInspection(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

module.exports = router;
