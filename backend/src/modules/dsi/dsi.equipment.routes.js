const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const { all } = require('../../db');
const audit = require('../audit/audit.service');
const repo = require('./dsi.equipment.repository');
const assignSvc = require('./dsi.assignments.service');

const router = express.Router();
router.use(requireAuth);

const canView = requireSubModule('dsi.parc', 'consultation');
const canEdit = requireSubModule('dsi.parc', 'edition');
const canAssign = requireSubModule('dsi.affectations', 'edition');

function parseFilters(q) {
  return {
    q: q.q || null, categoryId: q.category_id || null, typeId: q.type_id || null,
    brandId: q.brand_id || null, statut: q.statut || null, entityId: q.entity_id || null,
    siteId: q.site_id || null, etat: q.etat || null, modele: q.modele || null,
    employeeId: q.employee_id || null,
    sortKey: q.sortKey || null, sortDir: q.sortDir || null,
    page: q.page ? Number(q.page) : 1, pageSize: q.pageSize ? Number(q.pageSize) : 20,
  };
}

// Indicateurs de la file (avant /:id).
router.get('/stats', canView, async (req, res, next) => {
  try { res.json(await repo.stats(parseFilters(req.query))); } catch (e) { next(e); }
});

// Self-service : le matériel affecté à l'utilisateur courant (tout compte authentifié).
router.get('/mine', async (req, res, next) => {
  try {
    if (!req.user.employee_id) return res.json([]);
    res.json(await all(
      `${repo.EQ_SELECT} WHERE e.deleted_at IS NULL AND a.employee_id = $1 ORDER BY e.designation`,
      [req.user.employee_id]));
  } catch (e) { next(e); }
});

router.get('/', canView, async (req, res, next) => {
  try { res.json(await repo.list(parseFilters(req.query))); } catch (e) { next(e); }
});

router.get('/:id', canView, async (req, res, next) => {
  try {
    const eq = await repo.getById(Number(req.params.id));
    if (!eq) return res.status(404).json({ error: 'Équipement introuvable.' });
    res.json(eq);
  } catch (e) { next(e); }
});

router.get('/:id/assignments', canView, async (req, res, next) => {
  try { res.json(await repo.assignments(Number(req.params.id))); } catch (e) { next(e); }
});

router.post('/', canEdit, async (req, res, next) => {
  try {
    const eq = await repo.create(req.body || {}, req.user.id);
    await audit.logAction({ tableName: 'dsi_equipment', recordId: eq.id, action: 'dsi_equipment_create', userId: req.user.id, details: { numero: eq.numero_inventaire } });
    res.status(201).json(eq);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ce numéro d’inventaire existe déjà.' }); next(e); }
});

router.put('/:id', canEdit, async (req, res, next) => {
  try {
    const eq = await repo.update(Number(req.params.id), req.body || {});
    if (!eq) return res.status(404).json({ error: 'Équipement introuvable.' });
    await audit.logAction({ tableName: 'dsi_equipment', recordId: eq.id, action: 'dsi_equipment_update', userId: req.user.id, details: {} });
    res.json(eq);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ce numéro d’inventaire existe déjà.' }); next(e); }
});

router.delete('/:id', canEdit, async (req, res, next) => {
  try {
    await repo.softDelete(Number(req.params.id));
    await audit.logAction({ tableName: 'dsi_equipment', recordId: Number(req.params.id), action: 'dsi_equipment_delete', userId: req.user.id, details: {} });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Affectations (droit dsi.affectations edition).
router.post('/:id/assign', canAssign, async (req, res, next) => {
  try { res.status(201).json(await assignSvc.assign(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.post('/:id/transfer', canAssign, async (req, res, next) => {
  try { res.status(201).json(await assignSvc.transfer(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.post('/:id/return', canAssign, async (req, res, next) => {
  try { res.json(await assignSvc.restituer(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});

module.exports = router;
