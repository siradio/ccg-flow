const bcrypt = require('bcryptjs');
const { all, one, run } = require('../../db');

async function loadUserWithRoles(userId) {
  const user = await one(
    'SELECT id, nom, prenom, email, actif, employee_id, created_at FROM users WHERE id = $1',
    [userId]
  );
  if (!user) return null;

  const roles = await all(
    `SELECT uer.entity_id, e.code AS entity_code, uer.role_code
     FROM user_entity_roles uer
     LEFT JOIN entities e ON e.id = uer.entity_id
     WHERE uer.user_id = $1`,
    [userId]
  );
  const moduleRows = await all('SELECT module_key FROM user_module_access WHERE user_id = $1', [userId]);
  const buRows = await all('SELECT business_unit_id FROM user_business_unit_access WHERE user_id = $1', [userId]);
  return {
    ...user,
    roles,
    modules: moduleRows.map(m => m.module_key),
    businessUnits: buRows.map(b => b.business_unit_id),
  };
}

async function grantModule(userId, moduleKey) {
  const row = await one(
    `INSERT INTO user_module_access (user_id, module_key) VALUES ($1,$2)
     ON CONFLICT (user_id, module_key) DO NOTHING
     RETURNING id`,
    [userId, moduleKey]
  );
  return row ? row.id : null;
}

async function revokeModule(userId, accessRowId) {
  await run('DELETE FROM user_module_access WHERE id = $1 AND user_id = $2', [accessRowId, userId]);
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

async function createUser({ nom, prenom, email, password, employeeId }) {
  const hash = bcrypt.hashSync(password || 'changeme', 10);
  const row = await one(
    'INSERT INTO users (nom, prenom, email, password_hash, employee_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [nom, prenom, email, hash, employeeId || null]
  );
  return row.id;
}

async function updateUser(id, { nom, prenom, email, actif, password }) {
  const existing = await one('SELECT * FROM users WHERE id = $1', [id]);
  if (!existing) return null;
  const hash = password ? bcrypt.hashSync(password, 10) : existing.password_hash;
  await run(
    'UPDATE users SET nom=$1, prenom=$2, email=$3, actif=$4, password_hash=$5 WHERE id=$6',
    [
      nom ?? existing.nom,
      prenom ?? existing.prenom,
      email ?? existing.email,
      actif === undefined ? existing.actif : actif,
      hash,
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

async function listUsers() {
  const users = await all('SELECT id, nom, prenom, email, actif, created_at FROM users ORDER BY nom, prenom');
  const roles = await all(
    `SELECT uer.id, uer.user_id, uer.entity_id, e.code AS entity_code, uer.role_code
     FROM user_entity_roles uer LEFT JOIN entities e ON e.id = uer.entity_id`
  );
  const modules = await all('SELECT id, user_id, module_key FROM user_module_access');
  const businessUnits = await all(
    `SELECT uba.id, uba.user_id, uba.business_unit_id, bu.nom AS business_unit_nom
     FROM user_business_unit_access uba JOIN business_units bu ON bu.id = uba.business_unit_id`
  );
  return users.map(u => ({
    ...u,
    roles: roles.filter(r => r.user_id === u.id),
    modules: modules.filter(m => m.user_id === u.id),
    businessUnits: businessUnits.filter(b => b.user_id === u.id),
  }));
}

module.exports = {
  loadUserWithRoles, findByEmail, createUser, updateUser, addRole, removeRole, listUsers,
  grantModule, revokeModule, grantBusinessUnit, revokeBusinessUnit,
};
