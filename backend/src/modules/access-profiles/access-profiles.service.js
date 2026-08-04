const { all, one, run } = require('../../db');

// Le contenu du profil est un objet { roles, subModules, businessUnits } stocké en JSONB. On le
// sérialise explicitement (JSON.stringify) pour ne pas dépendre de la coercition implicite de pg.
function listProfiles() {
  return all('SELECT id, nom, description, data, created_at FROM access_profiles ORDER BY nom');
}

function getProfile(id) {
  return one('SELECT id, nom, description, data, created_at FROM access_profiles WHERE id = $1', [id]);
}

function createProfile({ nom, description, data, createdBy }) {
  return one(
    `INSERT INTO access_profiles (nom, description, data, created_by) VALUES ($1,$2,$3,$4)
     RETURNING id, nom, description, data, created_at`,
    [nom, description || null, JSON.stringify(data || {}), createdBy || null]
  );
}

async function updateProfile(id, { nom, description, data }) {
  const existing = await one('SELECT * FROM access_profiles WHERE id = $1', [id]);
  if (!existing) return null;
  return one(
    `UPDATE access_profiles SET nom=$1, description=$2, data=$3, updated_at=now() WHERE id=$4
     RETURNING id, nom, description, data, created_at`,
    [
      nom ?? existing.nom,
      description === undefined ? existing.description : description,
      JSON.stringify(data ?? existing.data),
      id,
    ]
  );
}

async function removeProfile(id) {
  await run('DELETE FROM access_profiles WHERE id = $1', [id]);
}

module.exports = { listProfiles, getProfile, createProfile, updateProfile, removeProfile };
