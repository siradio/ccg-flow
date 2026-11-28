// Module QHSE — Volet Qualité (QUA-11). Routes audits. Lecture gatée sur `qhse.audits` ;
// saisie (en-tête, constats) ≥ ajout ; clôture ≥ édition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.audits.service');

const router = express.Router();
const SUB = 'qhse.audits';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listAudits()); } catch (e) { next(e); }
});
router.get('/:id', requireRead, async (req, res, next) => {
  try {
    const a = await service.getAuditDetail(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Introuvable.' });
    res.json(a);
  } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createAudit(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', requireCreate, async (req, res, next) => {
  try { res.json(await service.updateAudit(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.put('/:id/findings', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveFindings(req.user, Number(req.params.id), (req.body && req.body.findings) || [])); } catch (e) { next(e); }
});
router.post('/:id/close', requireEdit, async (req, res, next) => {
  try { res.json(await service.closeAudit(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

module.exports = router;
