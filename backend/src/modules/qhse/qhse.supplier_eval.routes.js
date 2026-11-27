// Module QHSE — Volet Qualité (QUA-09). Routes évaluation fournisseurs. Lecture gatée sur
// `qhse.supplier_eval` ; création/édition ≥ ajout ; suppression ≥ édition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.supplier_eval.service');

const router = express.Router();
const SUB = 'qhse.supplier_eval';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listEvaluations()); } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createEvaluation(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', requireCreate, async (req, res, next) => {
  try { res.json(await service.updateEvaluation(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.delete('/:id', requireEdit, async (req, res, next) => {
  try { await service.removeEvaluation(Number(req.params.id)); res.json({ ok: true }); } catch (e) { next(e); }
});

module.exports = router;
