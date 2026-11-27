// Module QHSE — Volet Qualité (QUA-10). Routes équipements de mesure. Lecture gatée sur
// `qhse.equipment` ; création/édition/vérifications ≥ ajout ; suppression équipement ≥ édition.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./qhse.equipment.service');

const router = express.Router();
const SUB = 'qhse.equipment';
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(SUB);
const requireRead = requireSubModule(SUB);

router.use(requireAuth);

router.get('/', requireRead, async (req, res, next) => {
  try { res.json(await service.listEquipment()); } catch (e) { next(e); }
});
router.get('/:id', requireRead, async (req, res, next) => {
  try {
    const d = await service.getEquipmentDetail(Number(req.params.id));
    if (!d) return res.status(404).json({ error: 'Introuvable.' });
    res.json(d);
  } catch (e) { next(e); }
});
router.post('/', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createEquipment(req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', requireCreate, async (req, res, next) => {
  try { res.json(await service.updateEquipment(Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.post('/:id/verifications', requireCreate, async (req, res, next) => {
  try { res.status(201).json(await service.addVerification(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.delete('/:id/verifications/:verifId', requireCreate, async (req, res, next) => {
  try { res.json(await service.deleteVerification(Number(req.params.id), Number(req.params.verifId))); } catch (e) { next(e); }
});
router.delete('/:id', requireEdit, async (req, res, next) => {
  try { await service.removeEquipment(Number(req.params.id)); res.json({ ok: true }); } catch (e) { next(e); }
});

module.exports = router;
