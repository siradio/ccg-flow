const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const { all } = require('../../db');
const repo = require('./dsi.tickets.repository');
const svc = require('./dsi.tickets.service');

const router = express.Router();
router.use(requireAuth);
const canView = requireSubModule('dsi.tickets', 'consultation');
const canEdit = requireSubModule('dsi.tickets', 'edition');

function parseFilters(q) {
  return {
    q: q.q || null, statut: q.statut || null, open: q.open === 'true',
    priorityId: q.priority_id || null, categoryId: q.category_id || null,
    technicianId: q.technician_id || null, entityId: q.entity_id || null,
    equipmentId: q.equipment_id || null, demandeurId: q.demandeur_id || null,
    page: q.page ? Number(q.page) : 1, pageSize: q.pageSize ? Number(q.pageSize) : 20,
  };
}

router.get('/stats', canView, async (req, res, next) => {
  try { res.json(await repo.stats(parseFilters(req.query))); } catch (e) { next(e); }
});

// Utilisateurs assignables comme technicien (liste légère, gâtée par le module Tickets).
router.get('/users', canView, async (req, res, next) => {
  try {
    res.json(await all(`SELECT id, TRIM(CONCAT(prenom,' ',nom)) AS nom FROM users WHERE actif = true ORDER BY nom, prenom`));
  } catch (e) { next(e); }
});

router.get('/', canView, async (req, res, next) => {
  try {
    const data = await repo.list(parseFilters(req.query));
    res.json({ ...data, items: data.items.map(svc.withSla) });
  } catch (e) { next(e); }
});

router.get('/:id', canView, async (req, res, next) => {
  try {
    const t = await repo.getById(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'Ticket introuvable.' });
    res.json({ ...svc.withSla(t), events: await repo.events(t.id) });
  } catch (e) { next(e); }
});

router.post('/', canEdit, async (req, res, next) => {
  try { res.status(201).json(await svc.create(req.user, req.body || {})); } catch (e) { next(e); }
});
router.put('/:id', canEdit, async (req, res, next) => {
  try { res.json(await svc.update(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.post('/:id/assign', canEdit, async (req, res, next) => {
  try { res.json(await svc.assign(req.user, Number(req.params.id), req.body?.technician_id)); } catch (e) { next(e); }
});
router.post('/:id/status', canEdit, async (req, res, next) => {
  try { res.json(await svc.setStatus(req.user, Number(req.params.id), req.body?.statut, req.body?.comment)); } catch (e) { next(e); }
});
router.post('/:id/comment', canEdit, async (req, res, next) => {
  try { res.json(await svc.comment(req.user, Number(req.params.id), req.body?.comment, req.body?.visibilite || 'interne')); } catch (e) { next(e); }
});

module.exports = router;
