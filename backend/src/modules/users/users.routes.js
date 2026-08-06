const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireUserAdmin, isSuperAdmin, NIVEAUX } = require('../../middleware/permissions');
const { MODULES, SUB_MODULE_KEYS } = require('../../config/modules');
const usersService = require('./users.service');
const { generatePassword, sendCredentialsEmail, sendAccessRejectedEmail } = require('./users.email');
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
    const { nom, prenom, email, password, employeeId, notify, copyFromUserId } = req.body || {};
    if (!nom || !prenom || !email) {
      return res.status(400).json({ error: 'Nom, prénom et email obligatoires.' });
    }
    const existing = await usersService.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email déjà utilisé.' });

    const typedPassword = (password || '').trim();
    // Sans mot de passe saisi, on en génère TOUJOURS un fort (jamais le défaut "changeme", qui
    // laissait un compte inconnectable) — qu'on notifie par email ou non. Il est renvoyé à l'admin
    // ci-dessous pour qu'il puisse le communiquer manuellement.
    const generated = !typedPassword;
    const effectivePassword = typedPassword || generatePassword();

    const id = await usersService.createUser({ nom, prenom, email, password: effectivePassword, employeeId });

    // Option "copier les accès de…" : on rejoue le bundle du compte source sur le nouveau (en plus du
    // rôle demandeur posé par défaut). Les rôles restreints (super_admin/support_it) ne sont copiés
    // que par un super_admin ; sinon ils sont ignorés silencieusement pour ne pas faire échouer une
    // création par ailleurs valide.
    if (copyFromUserId) {
      const source = await usersService.findById(Number(copyFromUserId));
      if (source) {
        const bundle = await usersService.getUserAccessBundle(source.id);
        if (!isSuperAdmin(req.user)) {
          bundle.roles = bundle.roles.filter(r => !RESTRICTED_ROLES.includes(r.role_code));
        }
        await usersService.applyAccessBundle(id, bundle);
      }
    }
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

// Valide une demande d'accès (statut pending -> active) : le compte peut désormais se connecter.
// On génère un mot de passe et on l'envoie par email au demandeur (comme une création classique).
router.post('/:id/approve-access', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const user = await usersService.findById(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (user.access_status !== 'pending') {
      return res.status(400).json({ error: "Cette demande n'est pas en attente de validation." });
    }
    const password = generatePassword();
    await usersService.updateUser(user.id, { password });
    await usersService.setAccessStatus(user.id, 'active');

    const notification = { sent: false };
    try {
      await sendCredentialsEmail({ to: user.email, prenom: user.prenom, email: user.email, password, loginUrl: buildLoginUrl(req) });
      notification.sent = true;
    } catch (e) {
      notification.error = e.message;
    }
    res.json({ notification, generatedPassword: password });
  } catch (e) { next(e); }
});

// Rejette une demande d'accès (statut -> rejected) et notifie le demandeur par email avec le motif.
router.post('/:id/reject-access', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const user = await usersService.findById(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (user.access_status !== 'pending') {
      return res.status(400).json({ error: "Cette demande n'est pas en attente de validation." });
    }
    await usersService.setAccessStatus(user.id, 'rejected');
    const notification = { sent: false };
    try {
      await sendAccessRejectedEmail({ to: user.email, prenom: user.prenom, note: (req.body && req.body.note) || '' });
      notification.sent = true;
    } catch (e) {
      notification.error = e.message;
    }
    res.json({ ok: true, notification });
  } catch (e) { next(e); }
});

router.post('/:id/roles', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const { entity_id, role_code } = req.body || {};
    const isGlobalRole = role_code === 'super_admin' || role_code === 'support_it';
    // entity_id === 'all' : raccourci "Toutes les entités" — accorde le rôle sur chaque entité en
    // un seul appel, au lieu de le répéter entité par entité côté admin.
    const allEntities = entity_id === 'all';
    if (!role_code || (!isGlobalRole && !allEntities && !entity_id)) {
      return res.status(400).json({ error: 'role_code requis, entity_id requis sauf pour super_admin/support_it.' });
    }
    if (RESTRICTED_ROLES.includes(role_code) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: `Seul un super_admin peut accorder le rôle "${role_code}".` });
    }
    if (allEntities && !isGlobalRole) {
      // "Toutes les entités" n'a de sens que pour un rôle métier ; un rôle global ignore l'entité.
      await usersService.addRoleAllEntities(Number(req.params.id), role_code);
    } else {
      await usersService.addRole(Number(req.params.id), isGlobalRole ? null : Number(entity_id), role_code);
    }
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

// Copie tous les accès (rôles par entité + niveaux modules + BU) d'un utilisateur source vers cet
// utilisateur. Additif : les droits déjà présents sont conservés.
router.post('/:id/copy-access-from', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const { sourceUserId } = req.body || {};
    if (!sourceUserId) return res.status(400).json({ error: 'sourceUserId requis.' });
    if (Number(sourceUserId) === Number(req.params.id)) {
      return res.status(400).json({ error: 'Source et destination identiques.' });
    }
    const source = await usersService.findById(Number(sourceUserId));
    const target = await usersService.findById(Number(req.params.id));
    if (!source || !target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const bundle = await usersService.getUserAccessBundle(source.id);
    if (bundle.roles.some(r => RESTRICTED_ROLES.includes(r.role_code)) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Seul un super_admin peut copier un compte incluant super_admin/support_it.' });
    }
    await usersService.applyAccessBundle(target.id, bundle);
    res.json(await usersService.loadUserWithRoles(target.id));
  } catch (e) { next(e); }
});

router.get('/sub-module-catalog', requireAuth, requireUserAdmin, (req, res) => {
  res.json(MODULES);
});

// Doit rester déclaré après les routes GET à segment fixe ci-dessus (ex. /sub-module-catalog),
// sinon ':id' les intercepterait — Express matche dans l'ordre de déclaration.
router.get('/:id', requireAuth, requireUserAdmin, async (req, res, next) => {
  try {
    const user = await usersService.loadUserWithRoles(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json(user);
  } catch (e) { next(e); }
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
    // business_unit_id === 'all' : raccourci "Toutes les BU" — accès (lecture + écriture) à chaque
    // business unit en un seul appel. À distinguer de "aucune BU accordée" qui reste, lui, en
    // lecture seule sur toutes (voir permissions.js visibleBusinessUnitIds).
    if (business_unit_id === 'all') {
      await usersService.grantAllBusinessUnits(Number(req.params.id));
    } else {
      await usersService.grantBusinessUnit(Number(req.params.id), Number(business_unit_id));
    }
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
