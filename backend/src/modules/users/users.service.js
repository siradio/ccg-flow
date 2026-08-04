const bcrypt = require('bcryptjs');
const { all, one, run } = require('../../db');
const { SUB_MODULE_KEYS } = require('../../config/modules');

// Niveaux d'accès aux modules, du plus faible au plus fort (miroir de permissions.js) — défini ici
// pour valider un bundle appliqué sans dépendre du middleware depuis la couche service.
const BUNDLE_NIVEAUX = ['consultation', 'ajout', 'edition'];

async function loadUserWithRoles(userId) {
  const user = await one(
    'SELECT id, nom, prenom, email, actif, access_status, telephone, fonction, employee_id, created_at FROM users WHERE id = $1',
    [userId]
  );
  if (!user) return null;

  const roles = await all(
    `SELECT uer.id, uer.entity_id, e.code AS entity_code, uer.role_code
     FROM user_entity_roles uer
     LEFT JOIN entities e ON e.id = uer.entity_id
     WHERE uer.user_id = $1`,
    [userId]
  );
  const buRows = await all('SELECT business_unit_id FROM user_business_unit_access WHERE user_id = $1', [userId]);
  const subModuleRows = await all('SELECT sub_module_key, niveau FROM user_sub_module_access WHERE user_id = $1', [userId]);
  return {
    ...user,
    roles,
    businessUnits: buRows.map(b => b.business_unit_id),
    subModules: subModuleRows,
  };
}

// Une seule ligne par (user, sous-module) — upsert, remplace grantModule/setPrixNiveau (SPEC.md
// §2.3) : chaque octroi porte désormais son niveau dès la création, plus d'état intermédiaire
// "accordé mais niveau par défaut oublié".
async function setSubModuleAccess(userId, subModuleKey, niveau) {
  await run(
    `INSERT INTO user_sub_module_access (user_id, sub_module_key, niveau) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, sub_module_key) DO UPDATE SET niveau = $3, updated_at = now()`,
    [userId, subModuleKey, niveau]
  );
}

async function revokeSubModuleAccess(userId, subModuleKey) {
  await run('DELETE FROM user_sub_module_access WHERE user_id = $1 AND sub_module_key = $2', [userId, subModuleKey]);
}

async function grantBusinessUnit(userId, businessUnitId) {
  const row = await one(
    `INSERT INTO user_business_unit_access (user_id, business_unit_id) VALUES ($1,$2)
     ON CONFLICT (user_id, business_unit_id) DO NOTHING
     RETURNING id`,
    [userId, businessUnitId]
  );
  return row ? row.id : null;
}

// "Toutes les BU" : accorde l'accès à chaque business unit en une fois (pendant BU de
// addRoleAllEntities). Idempotent grâce au ON CONFLICT ... DO NOTHING.
async function grantAllBusinessUnits(userId) {
  const bus = await all('SELECT id FROM business_units');
  for (const b of bus) {
    await run(
      `INSERT INTO user_business_unit_access (user_id, business_unit_id) VALUES ($1,$2)
       ON CONFLICT (user_id, business_unit_id) DO NOTHING`,
      [userId, b.id]
    );
  }
  return bus.length;
}

async function revokeBusinessUnit(userId, accessRowId) {
  await run('DELETE FROM user_business_unit_access WHERE id = $1 AND user_id = $2', [accessRowId, userId]);
}

// Photo complète des droits d'un utilisateur (rôles par entité + niveaux modules + accès BU), sous
// une forme rejouable telle quelle par applyAccessBundle. Sert à "copier les accès d'un user" et à
// "enregistrer un profil d'accès à partir d'un user".
async function getUserAccessBundle(userId) {
  const roles = await all('SELECT entity_id, role_code FROM user_entity_roles WHERE user_id = $1', [userId]);
  const subModules = await all('SELECT sub_module_key AS key, niveau FROM user_sub_module_access WHERE user_id = $1', [userId]);
  const bus = await all('SELECT business_unit_id FROM user_business_unit_access WHERE user_id = $1', [userId]);
  return {
    roles: roles.map(r => ({ role_code: r.role_code, entity_id: r.entity_id })),
    subModules: subModules.map(s => ({ key: s.key, niveau: s.niveau })),
    businessUnits: bus.map(b => b.business_unit_id),
  };
}

// Applique un bundle d'accès à un utilisateur (additif : ON CONFLICT DO NOTHING pour rôles/BU, upsert
// du niveau pour les modules). Tolérant aux valeurs invalides (rôle/sous-module/niveau inconnus
// ignorés) pour qu'un profil obsolète n'échoue jamais en bloc. NE fait PAS de contrôle d'autorisation
// (rôles restreints) : c'est à l'appelant (routes) de le faire avant. Renvoie un récap des compteurs.
async function applyAccessBundle(userId, bundle) {
  const { roles = [], subModules = [], businessUnits = [] } = bundle || {};
  let rolesApplied = 0, modulesApplied = 0, busApplied = 0;
  for (const r of roles) {
    if (!r || !r.role_code) continue;
    if (r.entity_id === 'all') { await addRoleAllEntities(userId, r.role_code); rolesApplied++; continue; }
    await addRole(userId, r.entity_id != null ? Number(r.entity_id) : null, r.role_code);
    rolesApplied++;
  }
  for (const s of subModules) {
    if (!s || !SUB_MODULE_KEYS.includes(s.key) || !BUNDLE_NIVEAUX.includes(s.niveau)) continue;
    await setSubModuleAccess(userId, s.key, s.niveau);
    modulesApplied++;
  }
  for (const b of businessUnits) {
    if (b === 'all') { await grantAllBusinessUnits(userId); busApplied++; continue; }
    if (b != null) { await grantBusinessUnit(userId, Number(b)); busApplied++; }
  }
  return { rolesApplied, modulesApplied, busApplied };
}

async function findByEmail(email) {
  return one('SELECT * FROM users WHERE email = $1', [email]);
}

async function findById(id) {
  return one('SELECT id, nom, prenom, email, actif, access_status, telephone, fonction FROM users WHERE id = $1', [id]);
}

async function createUser({ nom, prenom, email, password, employeeId, telephone, fonction }) {
  const hash = bcrypt.hashSync(password || 'changeme', 10);
  const row = await one(
    'INSERT INTO users (nom, prenom, email, password_hash, employee_id, telephone, fonction) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [nom, prenom, email, hash, employeeId || null, telephone || null, fonction || null]
  );
  // Rôle demandeur sur toutes les entités par défaut : un compte fraîchement créé peut soumettre
  // une demande d'achat immédiatement, sans qu'un admin ajoute le rôle à la main pour chaque
  // entité — à retirer/ajuster ensuite si le compte a en réalité un rôle plus spécifique.
  const entities = await all('SELECT id FROM entities');
  for (const e of entities) {
    await run(
      `INSERT INTO user_entity_roles (user_id, entity_id, role_code) VALUES ($1,$2,'demandeur')
       ON CONFLICT (user_id, entity_id, role_code) DO NOTHING`,
      [row.id, e.id]
    );
  }
  return row.id;
}

// Création d'une DEMANDE d'accès (depuis la page de connexion) : compte au statut "pending", avec
// le rôle demandeur sur la seule entité choisie. Un mot de passe aléatoire est posé (inutilisable
// tant que le compte n'est pas validé et que l'admin n'a pas envoyé d'identifiants).
async function createPendingUser({ nom, prenom, email, telephone, fonction, entityId, password }) {
  const hash = bcrypt.hashSync(password, 10);
  const row = await one(
    `INSERT INTO users (nom, prenom, email, password_hash, telephone, fonction, access_status)
     VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id`,
    [nom, prenom, email, hash, telephone || null, fonction || null]
  );
  await run(
    `INSERT INTO user_entity_roles (user_id, entity_id, role_code) VALUES ($1,$2,'demandeur')
     ON CONFLICT (user_id, entity_id, role_code) DO NOTHING`,
    [row.id, entityId]
  );
  return row.id;
}

async function setAccessStatus(id, status) {
  await run('UPDATE users SET access_status = $1 WHERE id = $2', [status, id]);
  return loadUserWithRoles(id);
}

async function updateUser(id, { nom, prenom, email, actif, password, telephone, fonction }) {
  const existing = await one('SELECT * FROM users WHERE id = $1', [id]);
  if (!existing) return null;
  const hash = password ? bcrypt.hashSync(password, 10) : existing.password_hash;
  await run(
    'UPDATE users SET nom=$1, prenom=$2, email=$3, actif=$4, password_hash=$5, telephone=$6, fonction=$7 WHERE id=$8',
    [
      nom ?? existing.nom,
      prenom ?? existing.prenom,
      email ?? existing.email,
      actif === undefined ? existing.actif : actif,
      hash,
      telephone === undefined ? existing.telephone : telephone,
      fonction === undefined ? existing.fonction : fonction,
      id,
    ]
  );
  return loadUserWithRoles(id);
}

async function addRole(userId, entityId, roleCode) {
  const row = await one(
    `INSERT INTO user_entity_roles (user_id, entity_id, role_code) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, entity_id, role_code) DO NOTHING
     RETURNING id`,
    [userId, entityId, roleCode]
  );
  return row ? row.id : null;
}

// "Toutes les entités" : accorde le rôle sur CHAQUE entité en une fois, évitant à l'admin de
// répéter l'octroi entité par entité (même principe que le rôle demandeur posé par défaut à la
// création, ci-dessus). On matérialise une ligne par entité plutôt qu'un entity_id NULL "joker" :
// NULL est déjà réservé aux rôles globaux (super_admin/support_it) et hasRoleOnEntity compare une
// égalité stricte d'entité — un joker imposerait de réécrire toute la vérification de permissions.
async function addRoleAllEntities(userId, roleCode) {
  const entities = await all('SELECT id FROM entities');
  for (const e of entities) {
    await run(
      `INSERT INTO user_entity_roles (user_id, entity_id, role_code) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, entity_id, role_code) DO NOTHING`,
      [userId, e.id, roleCode]
    );
  }
  return entities.length;
}

async function removeRole(userId, roleRowId) {
  await run('DELETE FROM user_entity_roles WHERE id = $1 AND user_id = $2', [roleRowId, userId]);
}

async function getRoleById(roleRowId) {
  return one('SELECT id, user_id, entity_id, role_code FROM user_entity_roles WHERE id = $1', [roleRowId]);
}

async function listUsers() {
  const users = await all('SELECT id, nom, prenom, email, actif, access_status, telephone, fonction, created_at FROM users ORDER BY nom, prenom');
  const roles = await all(
    `SELECT uer.id, uer.user_id, uer.entity_id, e.code AS entity_code, uer.role_code
     FROM user_entity_roles uer LEFT JOIN entities e ON e.id = uer.entity_id`
  );
  const businessUnits = await all(
    `SELECT uba.id, uba.user_id, uba.business_unit_id, bu.nom AS business_unit_nom
     FROM user_business_unit_access uba JOIN business_units bu ON bu.id = uba.business_unit_id`
  );
  const subModules = await all('SELECT user_id, sub_module_key, niveau FROM user_sub_module_access');
  return users.map(u => ({
    ...u,
    roles: roles.filter(r => r.user_id === u.id),
    businessUnits: businessUnits.filter(b => b.user_id === u.id),
    subModules: subModules.filter(s => s.user_id === u.id),
  }));
}

module.exports = {
  loadUserWithRoles, findByEmail, findById, createUser, createPendingUser, setAccessStatus, updateUser,
  addRole, addRoleAllEntities, removeRole, getRoleById, listUsers,
  setSubModuleAccess, revokeSubModuleAccess, grantBusinessUnit, grantAllBusinessUnits, revokeBusinessUnit,
  getUserAccessBundle, applyAccessBundle,
};
