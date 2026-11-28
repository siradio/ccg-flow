// Module QHSE — Volet SST (SST-02). Routes évaluation des risques. Lecture gatée sur `qhse.sst_risks`,
// création/édition ≥ ajout, suppression ≥ édition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.sst_risks.service');

const router = express.Router();
const SUB = 'qhse.sst_risks';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listRisks()); } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createRisk(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', requireCreate, async (req, res, next) => {
  try { res.json(await service.updateRisk(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.delete('/:id', requireEdit, async (req, res, next) => {
  try { await service.removeRisk(Number(req.params.id)); res.json({ ok: true }); } catch (e) { next(e); }
});

module.exports = router;
