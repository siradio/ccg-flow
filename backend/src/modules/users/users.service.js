const bcrypt = require('bcryptjs');
const { all, one, run } = require('../../db');

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

async function revokeBusinessUnit(userId, accessRowId) {
  await run('DELETE FROM user_business_unit_access WHERE id = $1 AND user_id = $2', [accessRowId, userId]);
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
  addRole, removeRole, getRoleById, listUsers,
  setSubModuleAccess, revokeSubModuleAccess, grantBusinessUnit, revokeBusinessUnit,
};
