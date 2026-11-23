// Module QHSE — Lot 3. Routes des non-conformités / CAPA. Lecture gatée sur `qhse.nc` ;
// saisie (en-tête, causes, actions) ≥ ajout ; clôture ≥ edition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.nc.service');

const router = express.Router();
const SUB = 'qhse.nc';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listNC()); } catch (e) { next(e); }
});
router.get('/:id', requireRead, async (req, res, next) => {
  try {
    const n = await service.getNCDetail(Number(req.params.id));
    if (!n) return res.status(404).json({ error: 'Introuvable.' });
    res.json(n);
  } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createNC(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', requireCreate, async (req, res, next) => {
  try { res.json(await service.updateNC(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.put('/:id/causes', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveCauses(req.user, Number(req.params.id), (req.body && req.body.causes) || [])); }
  catch (e) { next(e); }
});
router.put('/:id/actions', requireCreate, async (req, res, next) => {
  try { res.json(await service.saveActions(req.user, Number(req.params.id), (req.body && req.body.actions) || [])); }
  catch (e) { next(e); }
});
router.post('/:id/close', requireEdit, async (req, res, next) => {
  try { res.json(await service.closeNC(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

module.exports = router;
