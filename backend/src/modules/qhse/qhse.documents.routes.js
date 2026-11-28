// Module QHSE — Maîtrise documentaire (GED). Lecture gatée sur `qhse.documents` ;
// création / mise à jour ≥ ajout ; suppression ≥ édition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.documents.service');

const router = express.Router();
const SUB = 'qhse.documents';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listDocuments()); } catch (e) { next(e); }
});
router.get('/:id', requireRead, async (req, res, next) => {
  try {
    const d = await service.getDocumentDetail(Number(req.params.id));
    if (!d) return res.status(404).json({ error: 'Introuvable.' });
    res.json(d);
  } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createDocument(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', requireCreate, async (req, res, next) => {
  try { res.json(await service.updateDocument(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.delete('/:id', requireEdit, async (req, res, next) => {
  try { res.json(await service.deleteDocument(req.user, Number(req.params.id))); } catch (e) { next(e); }
});

module.exports = router;
