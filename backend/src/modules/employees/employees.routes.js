const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./employees.service');

const router = express.Router();
router.use(requireAuth);
router.use(requireSubModule('rh'));
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('rh');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { q, entity_id, business_unit_id, statut, departement } = req.query;
    res.json(await service.list({
      q,
      entityId: entity_id ? Number(entity_id) : null,
      businessUnitId: business_unit_id ? Number(business_unit_id) : null,
      statut,
      departement,
    }));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const employee = await service.getById(Number(req.params.id));
    if (!employee) return res.status(404).json({ error: 'Employé introuvable.' });
    res.json(employee);
  } catch (e) { next(e); }
});

router.post('/', requireAuth, requireCreate, async (req, res, next) => {
  try {
    const { nom, prenom, entity_id } = req.body || {};
    if (!nom || !prenom || !entity_id) {
      return res.status(400).json({ error: 'nom, prenom et entity_id sont obligatoires.' });
    }
    res.status(201).json(await service.create(req.body));
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const updated = await service.update(Number(req.params.id), req.body || {});
    if (!updated) return res.status(404).json({ error: 'Employé introuvable.' });
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    await service.remove(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
