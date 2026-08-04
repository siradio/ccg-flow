const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireUserAdmin, isSuperAdmin } = require('../../middleware/permissions');
const profilesService = require('./access-profiles.service');
const usersService = require('../users/users.service');

const router = express.Router();

// Accorder super_admin/support_it via un profil reste réservé aux vrais super_admin — même garde-fou
// que l'octroi direct de ces rôles (users.routes.js), pour empêcher toute auto-élévation via un
// support_it qui enregistrerait/appliquerait un profil "piégé".
const RESTRICTED_ROLES = ['super_admin', 'support_it'];
function bundleRestrictedRoles(data) {
  return ((data && data.roles) || []).map(r => r && r.role_code).filter(rc => RESTRICTED_ROLES.includes(rc));
}

router.get('/', requireAuth, requireUserAdmin, async (req, res, next) => {
  try { res.json(await profilesService.listProfiles()); }
  catch (e) { next(e); }
});

router.post('/', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const { nom, description, data } = req.body || {};
    if (!nom || !nom.trim()) return res.status(400).json({ error: 'Nom du profil requis.' });
    if (bundleRestrictedRoles(data).length && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Seul un super_admin peut enregistrer un profil incluant super_admin/support_it.' });
    }
    const created = await profilesService.createProfile({ nom: nom.trim(), description, data: data || {}, createdBy: req.user.id });
    res.status(201).json(created);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Un profil porte déjà ce nom.' });
    next(e);
  }
});

// Enregistre un profil À PARTIR des accès actuels d'un utilisateur : la façon la plus rapide de
// créer un modèle est de partir d'un compte déjà bien paramétré.
router.post('/from-user/:userId', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const { nom, description } = req.body || {};
    if (!nom || !nom.trim()) return res.status(400).json({ error: 'Nom du profil requis.' });
    const user = await usersService.findById(Number(req.params.userId));
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const data = await usersService.getUserAccessBundle(user.id);
    if (bundleRestrictedRoles(data).length && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Seul un super_admin peut enregistrer un profil incluant super_admin/support_it.' });
    }
    const created = await profilesService.createProfile({ nom: nom.trim(), description, data, createdBy: req.user.id });
    res.status(201).json(created);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Un profil porte déjà ce nom.' });
    next(e);
  }
});

router.put('/:id', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const { nom, description, data } = req.body || {};
    if (data !== undefined && bundleRestrictedRoles(data).length && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Seul un super_admin peut enregistrer un profil incluant super_admin/support_it.' });
    }
    const updated = await profilesService.updateProfile(Number(req.params.id), { nom, description, data });
    if (!updated) return res.status(404).json({ error: 'Profil introuvable.' });
    res.json(updated);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Un profil porte déjà ce nom.' });
    next(e);
  }
});

router.delete('/:id', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    await profilesService.removeProfile(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Applique un profil à un utilisateur (additif). Renvoie l'utilisateur mis à jour + un récap.
router.post('/:id/apply/:userId', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const profile = await profilesService.getProfile(Number(req.params.id));
    if (!profile) return res.status(404).json({ error: 'Profil introuvable.' });
    const user = await usersService.findById(Number(req.params.userId));
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (bundleRestrictedRoles(profile.data).length && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Seul un super_admin peut appliquer un profil incluant super_admin/support_it.' });
    }
    const applied = await usersService.applyAccessBundle(user.id, profile.data);
    res.json({ ...(await usersService.loadUserWithRoles(user.id)), applied });
  } catch (e) { next(e); }
});

module.exports = router;
