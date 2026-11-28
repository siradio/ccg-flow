// Module QHSE — Volet Qualité (QUA-08). Routes des réclamations clients. Lecture gatée sur
// `qhse.complaints` ; saisie (en-tête, actions) ≥ ajout ; clôture ≥ edition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.complaints.service');

const router = express.Router();
const SUB = 'qhse.complaints';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listComplaints()); } catch (e) { next(e); }
});
router.get('/:id', requireRead, async (req, res, next) => {
  try {
    const c = await service.getComplaintDetail(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Introuvable.' });
    res.json(c);
  } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createComplaint(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', requireCreate, async (req, res, next) => {
  try { res.json(await service.updateComplaint(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.put('/:id/actions', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveActions(req.user, Number(req.params.id), (req.body && req.body.actions) || [])); } catch (e) { next(e); }
});
router.post('/:id/close', requireEdit, async (req, res, next) => {
  try { res.json(await service.closeComplaint(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

module.exports = router;
