// Miroir serveur de la matrice de permissions (SPEC.md §2.2).
// IMPORTANT : c'est CETTE table qui fait foi pour la sécurité — jamais le front-end seul.
//
// Un utilisateur porte un rôle PAR ENTITÉ (user_entity_roles), sauf super_admin qui est global.
// req.user.roles = [{ entity_id, role_code }, ...], relu en base à chaque requête par
// requireAuth (middleware/auth.js) — jamais depuis le JWT, pour que les changements de droits
// prennent effet immédiatement sans attendre une reconnexion.

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

// Accès par module (RH, Achats, un référentiel précis...) — couche indépendante des rôles
// métier ci-dessus. req.user.modules est relu en base à chaque requête (voir requireAuth).
// Un super_admin a toujours accès à tout, sans avoir besoin d'un octroi explicite.
function hasModule(user, moduleKey) {
  if (isSuperAdmin(user)) return true;
  return (user.modules || []).includes(moduleKey);
}

function requireModule(moduleKey) {
  return (req, res, next) => {
    if (!hasModule(req.user, moduleKey)) {
      return res.status(403).json({ error: `Accès refusé : ce module (${moduleKey}) ne vous a pas été accordé.` });
    }
    next();
  };
}

// Accès par Business Unit (module Stock du Jour) — couche encore plus fine que hasModule('stock') :
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

// Niveau d'accès fin à l'intérieur du module `prix` (§3.8) — hiérarchie stricte :
// consultation < ajout < edition. req.user.prixNiveau est relu en base à chaque requête
// (voir requireAuth), défaut 'consultation' si aucune ligne n'existe pour cet utilisateur.
// Un super_admin a toujours le niveau le plus élevé, sans octroi explicite.
const PRIX_LEVELS = ['consultation', 'ajout', 'edition'];

function prixNiveau(user) {
  if (isSuperAdmin(user)) return 'edition';
  return user.prixNiveau || 'consultation';
}

function hasPrixLevel(user, minLevel) {
  return PRIX_LEVELS.indexOf(prixNiveau(user)) >= PRIX_LEVELS.indexOf(minLevel);
}

function requirePrixLevel(minLevel) {
  return (req, res, next) => {
    if (!hasPrixLevel(req.user, minLevel)) {
      return res.status(403).json({ error: `Accès refusé : niveau "${minLevel}" requis sur le module prix.` });
    }
    next();
  };
}

module.exports = {
  PERMS,
  isSuperAdmin,
  hasRoleOnEntity,
  hasAnyRoleOnEntity,
  hasPerm,
  hasPermAnywhere,
  hasModule,
  canWriteBusinessUnit,
  visibleBusinessUnitIds,
  prixNiveau,
  hasPrixLevel,
  requireSuperAdmin,
  requireRoleOnEntity,
  requireModule,
  requirePrixLevel,
};
