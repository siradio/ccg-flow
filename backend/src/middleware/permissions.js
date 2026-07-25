// Miroir serveur de la matrice de permissions (SPEC.md §2.2).
// IMPORTANT : c'est CETTE table qui fait foi pour la sécurité — jamais le front-end seul.
//
// Un utilisateur porte un rôle PAR ENTITÉ (user_entity_roles), sauf super_admin qui est global.
// Le JWT embarque req.user.roles = [{ entity_id, role_code }, ...].

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
// métier ci-dessus. req.user.modules est embarqué dans le JWT (voir auth.routes.js).
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

module.exports = {
  PERMS,
  isSuperAdmin,
  hasRoleOnEntity,
  hasAnyRoleOnEntity,
  hasPerm,
  hasPermAnywhere,
  hasModule,
  requireSuperAdmin,
  requireRoleOnEntity,
  requireModule,
};
