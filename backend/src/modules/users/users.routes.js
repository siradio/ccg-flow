const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSuperAdmin } = require('../../middleware/permissions');
const { MODULES, MODULE_KEYS } = require('../../config/modules');
const usersService = require('./users.service');

const router = express.Router();

router.get('/', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try { res.json(await usersService.listUsers()); }
  catch (e) { next(e); }
});

router.post('/', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { nom, prenom, email, password, employeeId } = req.body || {};
    if (!nom || !prenom || !email) {
      return res.status(400).json({ error: 'Nom, prénom et email obligatoires.' });
    }
    const existing = await usersService.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email déjà utilisé.' });
    const id = await usersService.createUser({ nom, prenom, email, password, employeeId });
    res.status(201).json(await usersService.loadUserWithRoles(id));
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const updated = await usersService.updateUser(Number(req.params.id), req.body || {});
    if (!updated) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json(updated);
  } catch (e) { next(e); }
});

router.post('/:id/roles', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { entity_id, role_code } = req.body || {};
    if (!role_code || (role_code !== 'super_admin' && !entity_id)) {
      return res.status(400).json({ error: 'role_code requis, entity_id requis sauf pour super_admin.' });
    }
    const id = await usersService.addRole(Number(req.params.id), entity_id ? Number(entity_id) : null, role_code);
    res.status(201).json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/roles/:roleId', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    await usersService.removeRole(Number(req.params.id), Number(req.params.roleId));
    res.json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

router.get('/module-catalog', requireAuth, requireSuperAdmin, (req, res) => {
  res.json(MODULES);
});

router.post('/:id/modules', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { module_key } = req.body || {};
    if (!MODULE_KEYS.includes(module_key)) {
      return res.status(400).json({ error: 'module_key invalide.' });
    }
    await usersService.grantModule(Number(req.params.id), module_key);
    res.status(201).json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/modules/:accessId', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    await usersService.revokeModule(Number(req.params.id), Number(req.params.accessId));
    res.json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

router.post('/:id/business-units', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { business_unit_id } = req.body || {};
    if (!business_unit_id) return res.status(400).json({ error: 'business_unit_id requis.' });
    await usersService.grantBusinessUnit(Number(req.params.id), Number(business_unit_id));
    res.status(201).json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/business-units/:accessId', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    await usersService.revokeBusinessUnit(Number(req.params.id), Number(req.params.accessId));
    res.json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

module.exports = router;
