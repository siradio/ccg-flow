// Module QHSE — Plan d'actions QHSE (registre transverse). Lecture gatée sur `qhse.actions` ;
// création / mise à jour ≥ ajout ; suppression ≥ édition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.actions.service');

const router = express.Router();
const SUB = 'qhse.actions';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listActions()); } catch (e) { next(e); }
});
router.get('/summary', requireRead, async (req, res, next) => {
  try { res.json(await service.summary()); } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createAction(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', requireCreate, async (req, res, next) => {
  try { res.json(await service.updateAction(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.delete('/:id', requireEdit, async (req, res, next) => {
  try { res.json(await service.deleteAction(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

module.exports = router;
