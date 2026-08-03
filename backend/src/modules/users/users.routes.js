const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireUserAdmin, isSuperAdmin, NIVEAUX } = require('../../middleware/permissions');
const { MODULES, SUB_MODULE_KEYS } = require('../../config/modules');
const usersService = require('./users.service');
const { generatePassword, sendCredentialsEmail } = require('./users.email');
const env = require('../../config/env');

const router = express.Router();

// URL de connexion pour les emails : l'URL publique configurée (env.appUrl, renseignée
// automatiquement sur Azure) prime ; à défaut seulement, on dérive de la requête (local).
function buildLoginUrl(req) {
  const base = env.appUrl || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/+$/, '')}/login`;
}

// Rôles réservés aux vrais super_admin (jamais à un support_it) : les accorder/retirer soi-même
// ouvrirait une auto-élévation de privilèges via le rôle support_it (§ users.routes.js).
const RESTRICTED_ROLES = ['super_admin', 'support_it'];

router.get('/', requireAuth, requireUserAdmin, async (req, res, next) => {
  try { res.json(await usersService.listUsers()); }
  catch (e) { next(e); }
});

router.post('/', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const { nom, prenom, email, password, employeeId, notify } = req.body || {};
    if (!nom || !prenom || !email) {
      return res.status(400).json({ error: 'Nom, prénom et email obligatoires.' });
    }
    const existing = await usersService.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email déjà utilisé.' });

    const typedPassword = (password || '').trim();
    // Quand on notifie sans mot de passe saisi, on en génère un fort plutôt que de retomber sur le
    // défaut "changeme" (qui n'aurait aucun sens à envoyer par email). Comportement inchangé sinon.
    const generated = notify && !typedPassword;
    const effectivePassword = typedPassword || (generated ? generatePassword() : undefined);

    const id = await usersService.createUser({ nom, prenom, email, password: effectivePassword, employeeId });
    const user = await usersService.loadUserWithRoles(id);

    const notification = { requested: !!notify, sent: false };
    if (notify) {
      try {
        await sendCredentialsEmail({ to: email, prenom, email, password: effectivePassword, loginUrl: buildLoginUrl(req) });
        notification.sent = true;
      } catch (e) {
        // Envoi isolé, jamais bloquant : le compte est créé même si l'email échoue (même principe
        // que les demandes de devis, §3.1). L'UI affichera le repli manuel.
        notification.sent = false;
        notification.error = e.message;
      }
    }
    // Mot de passe renvoyé UNIQUEMENT quand il a été généré côté serveur, pour que l'admin puisse
    // le communiquer manuellement si l'email n'est pas parti (jamais exposé si l'admin l'a saisi).
    res.status(201).json({ ...user, notification, generatedPassword: generated ? effectivePassword : undefined });
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const updated = await usersService.updateUser(Number(req.params.id), req.body || {});
    if (!updated) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json(updated);
  } catch (e) { next(e); }
});

// Définit le mot de passe d'un utilisateur existant, depuis Admin -> Utilisateurs. L'admin peut
// SAISIR un mot de passe précis (celui de son choix, communiqué comme il veut) OU laisser vide pour
// en générer un fort automatiquement. L'envoi par email est optionnel (`notify`). Comme les mots de
// passe sont hachés (jamais stockés en clair), on ne peut jamais « renvoyer » l'ancien : toute
// (ré)émission passe forcément par la définition d'un nouveau mot de passe — d'où le champ explicite
// côté UI plutôt qu'un bouton « renvoyer » trompeur.
router.post('/:id/set-password', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const user = await usersService.findById(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const { password, notify } = req.body || {};
    const typed = (password || '').trim();
    if (typed && typed.length < 8) {
      return res.status(400).json({ error: 'Mot de passe trop court (8 caractères minimum).' });
    }
    const generated = !typed;
    const newPassword = typed || generatePassword();
    await usersService.updateUser(user.id, { password: newPassword });

    const notification = { requested: !!notify, sent: false };
    if (notify) {
      try {
        await sendCredentialsEmail({ to: user.email, prenom: user.prenom, email: user.email, password: newPassword, loginUrl: buildLoginUrl(req) });
        notification.sent = true;
      } catch (e) {
        // Envoi isolé, jamais bloquant : le mot de passe est déjà changé, l'UI proposera le repli
        // manuel avec le mot de passe généré ci-dessous (le cas échéant).
        notification.error = e.message;
      }
    }
    // Mot de passe renvoyé UNIQUEMENT quand il a été généré côté serveur (jamais celui saisi par
    // l'admin, qu'il connaît déjà), pour permettre un repli manuel.
    res.json({ notification, generatedPassword: generated ? newPassword : undefined });
  } catch (e) { next(e); }
});

router.post('/:id/roles', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const { entity_id, role_code } = req.body || {};
    const isGlobalRole = role_code === 'super_admin' || role_code === 'support_it';
    if (!role_code || (!isGlobalRole && !entity_id)) {
      return res.status(400).json({ error: 'role_code requis, entity_id requis sauf pour super_admin/support_it.' });
    }
    if (RESTRICTED_ROLES.includes(role_code) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: `Seul un super_admin peut accorder le rôle "${role_code}".` });
    }
    const id = await usersService.addRole(Number(req.params.id), entity_id ? Number(entity_id) : null, role_code);
    res.status(201).json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/roles/:roleId', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const role = await usersService.getRoleById(Number(req.params.roleId));
    if (role && RESTRICTED_ROLES.includes(role.role_code) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: `Seul un super_admin peut retirer le rôle "${role.role_code}".` });
    }
    await usersService.removeRole(Number(req.params.id), Number(req.params.roleId));
    res.json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

router.get('/sub-module-catalog', requireAuth, requireUserAdmin, (req, res) => {
  res.json(MODULES);
});

// Upsert : une seule ligne par (user, sous-module), le niveau est fourni dès l'octroi — plus
// d'état intermédiaire "accordé mais niveau par défaut" (voir SPEC.md §2.3).
router.put('/:id/sub-modules/:key', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const { niveau } = req.body || {};
    if (!SUB_MODULE_KEYS.includes(req.params.key)) {
      return res.status(400).json({ error: 'Sous-module invalide.' });
    }
    if (!NIVEAUX.includes(niveau)) {
      return res.status(400).json({ error: `niveau invalide, attendu: ${NIVEAUX.join('|')}.` });
    }
    await usersService.setSubModuleAccess(Number(req.params.id), req.params.key, niveau);
    res.status(201).json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/sub-modules/:key', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    await usersService.revokeSubModuleAccess(Number(req.params.id), req.params.key);
    res.json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

router.post('/:id/business-units', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const { business_unit_id } = req.body || {};
    if (!business_unit_id) return res.status(400).json({ error: 'business_unit_id requis.' });
    await usersService.grantBusinessUnit(Number(req.params.id), Number(business_unit_id));
    res.status(201).json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/business-units/:accessId', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    await usersService.revokeBusinessUnit(Number(req.params.id), Number(req.params.accessId));
    res.json(await usersService.loadUserWithRoles(Number(req.params.id)));
  } catch (e) { next(e); }
});

module.exports = router;
