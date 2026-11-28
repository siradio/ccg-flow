// Module QHSE — Volet SST (SST-03). Routes accidents / incidents. Lecture gatée sur
// `qhse.sst_accidents` ; saisie (en-tête, actions) ≥ ajout ; clôture ≥ édition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.sst_accidents.service');

const router = express.Router();
const SUB = 'qhse.sst_accidents';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listAccidents()); } catch (e) { next(e); }
});
router.get('/:id', requireRead, async (req, res, next) => {
  try {
    const a = await service.getAccidentDetail(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Introuvable.' });
    res.json(a);
  } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createAccident(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', requireCreate, async (req, res, next) => {
  try { res.json(await service.updateAccident(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.put('/:id/actions', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveActions(req.user, Number(req.params.id), (req.body && req.body.actions) || [])); } catch (e) { next(e); }
});
router.post('/:id/close', requireEdit, async (req, res, next) => {
  try { res.json(await service.closeAccident(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

// Heures travaillées (saisie mensuelle par BU) + indicateurs TF / TG.
router.get('/hours/:annee', requireRead, async (req, res, next) => {
  try { res.json(await service.listHours(req.params.annee)); } catch (e) { next(e); }
});
router.put('/hours/:annee', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveHours(req.user, req.params.annee, (req.body && req.body.rows) || [])); } catch (e) { next(e); }
});
router.get('/indicators/:annee', requireRead, async (req, res, next) => {
  try { res.json(await service.indicators(req.params.annee)); } catch (e) { next(e); }
});

module.exports = router;
