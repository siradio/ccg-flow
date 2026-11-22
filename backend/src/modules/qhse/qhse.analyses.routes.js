// Module QHSE — Lot 1. Saisie des analyses de laboratoire. Lecture gâtée sur le sous-module
// `qhse.labo` ; saisie ≥ ajout ; validation ≥ edition (séparation saisie / validation).
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.analyses.service');

const router = express.Router();
const SUB = 'qhse.labo';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

// --- Échantillons ---
router.get('/samples', requireRead, async (req, res, next) => {
  try { res.json(await service.listSamples()); } catch (e) { next(e); }
});
router.get('/samples/:id', requireRead, async (req, res, next) => {
  try {
    const s = await service.getSampleDetail(Number(req.params.id));
    if (!s) return res.status(404).json({ error: 'Introuvable.' });
    res.json(s);
  } catch (e) { next(e); }
});
router.post('/samples', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createSample(req.user, req.body || {})); } catch (e) { next(e); }
});

// --- Analyses ---
router.get('/analyses/:id', requireRead, async (req, res, next) => {
  try {
    const a = await service.getAnalysisDetail(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Introuvable.' });
    res.json(a);
  } catch (e) { next(e); }
});
router.post('/analyses', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createAnalysis(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/analyses/:id/results', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveResults(req.user, Number(req.params.id), (req.body && req.body.results) || [])); }
  catch (e) { next(e); }
});
router.post('/analyses/:id/validate', requireEdit, async (req, res, next) => {
  try { res.json(await service.validateAnalysis(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

module.exports = router;
