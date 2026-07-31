// Miroir serveur de la matrice de permissions (SPEC.md §2.2).
// IMPORTANT : c'est CETTE table qui fait foi pour la sécurité — jamais le front-end seul.
//
// Un utilisateur porte un rôle PAR ENTITÉ (user_entity_roles), sauf super_admin qui est global.
// req.user.roles = [{ entity_id, role_code }, ...], relu en base à chaque requête par
// requireAuth (middleware/auth.js) — jamais depuis le JWT, pour que les changements de droits
// prennent effet immédiatement sans attendre une reconnexion.

const { MODULES } = require('../config/modules');

const PERMS = {
  super_admin:       ['all'],
  demandeur:         ['pa_create', 'pa_view_own'],
  service_achat:     ['pa_view_own', 'pa_view_entity', 'pa_analyse', 'pa_devis_gerer', 'pa_valider_achat'],
  controle_gestion:  ['pa_view_own', 'pa_view_entity', 'pa_valider_cg'],
  finances:          ['pa_view_own', 'pa_view_entity', 'pa_valider_finances'],
  dga:               ['pa_view_own', 'pa_view_entity', 'pa_valider_dga'],
};

function isSuperAdmin(user) {
  return (user.roles || []).some(r => r.role_code === 'super_admin');
}

// L'utilisateur détient-il ce rôle sur cette entité (ou super_admin, qui a accès partout) ?
function hasRoleOnEntity(user, roleCode, entityId) {
  if (isSuperAdmin(user)) return true;
  return (user.roles || []).some(r => r.role_code === roleCode && Number(r.entity_id) === Number(entityId));
}

// L'utilisateur détient-il N'IMPORTE QUEL rôle donnant ce niveau d'accès sur cette entité ?
function hasAnyRoleOnEntity(user, entityId) {
  if (isSuperAdmin(user)) return true;
  return (user.roles || []).some(r => Number(r.entity_id) === Number(entityId));
}

function hasPerm(roleCode, perm) {
  const ps = PERMS[roleCode] || [];
  return ps.includes('all') || ps.includes(perm);
}

// L'utilisateur détient-il ce perm sur AU MOINS UNE de ses entités (usage: listes filtrées ensuite par entité) ?
function hasPermAnywhere(user, perm) {
  if (isSuperAdmin(user)) return true;
  return (user.roles || []).some(r => hasPerm(r.role_code, perm));
}

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  }
  next();
}

function requireRoleOnEntity(roleCode, entityId) {
  return (req, res, next) => {
    if (!hasRoleOnEntity(req.user, roleCode, entityId)) {
      return res.status(403).json({ error: `Accès non autorisé pour ce rôle (${roleCode} requis sur cette entité).` });
    }
    next();
  };
}

// Accès par sous-module (RH, Achats, Stock du Jour, Mouvement Stock, un référentiel précis...) —
// couche indépendante des rôles métier ci-dessus, remplace l'ancien accès binaire par module
// (SPEC.md §2.3) : chaque sous-module a un niveau consultation < ajout < edition, réutilisant le
// vocabulaire déjà en place pour Prix plutôt que d'en inventer un nouveau. req.user.subModules
// (relu en base à chaque requête, voir requireAuth) = [{ sub_module_key, niveau }, ...].
// Un super_admin a toujours le niveau le plus élevé partout, sans octroi explicite.
const NIVEAUX = ['consultation', 'ajout', 'edition'];

function subModuleNiveau(user, subModuleKey) {
  if (isSuperAdmin(user)) return 'edition';
  const row = (user.subModules || []).find(s => s.sub_module_key === subModuleKey);
  return row ? row.niveau : null;
}

function hasSubModuleLevel(user, subModuleKey, minNiveau = 'consultation') {
  const niveau = subModuleNiveau(user, subModuleKey);
  if (!niveau) return false;
  return NIVEAUX.indexOf(niveau) >= NIVEAUX.indexOf(minNiveau);
}

function requireSubModule(subModuleKey, minNiveau = 'consultation') {
  return (req, res, next) => {
    if (!hasSubModuleLevel(req.user, subModuleKey, minNiveau)) {
      return res.status(403).json({ error: `Accès refusé : niveau "${minNiveau}" requis sur "${subModuleKey}".` });
    }
    next();
  };
}

// Paire create/edit réutilisée par tous les référentiels (via crud.factory.js, ou câblée à la
// main pour ceux qui n'y passent pas — products.routes.js, suppliers.routes.js) : ajout >=
// 'ajout', modification/suppression >= 'edition'.
function requireSubModuleWrite(subModuleKey) {
  return { create: requireSubModule(subModuleKey, 'ajout'), edit: requireSubModule(subModuleKey, 'edition') };
}

// Dérivé du catalogue (config/modules.js) : vrai si l'utilisateur a un accès (n'importe quel
// niveau) à AU MOINS UN sous-module de ce module — sert uniquement à décider si un lien de nav
// de premier niveau doit s'afficher, jamais à gater un écran précis (chaque écran gate sur son
// propre sous-module via requireSubModule).
function hasModuleAccess(user, moduleKey) {
  if (isSuperAdmin(user)) return true;
  const mod = MODULES.find(m => m.key === moduleKey);
  if (!mod) return false;
  const keys = mod.subModules.length ? mod.subModules.map(sm => sm.key) : [mod.key];
  return keys.some(k => !!subModuleNiveau(user, k));
}

// Accès par Business Unit (module Stock du Jour) — couche encore plus fine que hasSubModuleLevel :
// un "Gestionnaire de Stock" ne doit voir/saisir que la ou les BU qui lui sont accordées.
// req.user.businessUnits = tableau d'ids de BU, relu en base à chaque requête (voir requireAuth).
//
// - Sans AUCUN octroi de BU (tableau vide) : accès en LECTURE SEULE à toutes les BU (cf. §7 du
//   cahier des charges : "les autres utilisateurs disposent uniquement d'un accès en lecture").
// - Avec au moins un octroi : restreint à CES BU précises, en lecture ET en écriture.
function canWriteBusinessUnit(user, businessUnitId) {
  if (isSuperAdmin(user)) return true;
  return (user.businessUnits || []).map(Number).includes(Number(businessUnitId));
}

// Retourne null si aucune restriction de lecture ne s'applique (super_admin, ou lecteur sans
// octroi BU précis), sinon le tableau des ids de BU auxquels se limiter.
function visibleBusinessUnitIds(user) {
  if (isSuperAdmin(user)) return null;
  const granted = (user.businessUnits || []).map(Number);
  return granted.length > 0 ? granted : null;
}

module.exports = {
  PERMS,
  isSuperAdmin,
  hasRoleOnEntity,
  hasAnyRoleOnEntity,
  hasPerm,
  hasPermAnywhere,
  subModuleNiveau,
  hasSubModuleLevel,
  hasModuleAccess,
  canWriteBusinessUnit,
  visibleBusinessUnitIds,
  requireSuperAdmin,
  requireRoleOnEntity,
  requireSubModule,
  requireSubModuleWrite,
  NIVEAUX,
};
