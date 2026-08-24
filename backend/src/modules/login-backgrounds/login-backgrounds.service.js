const { all, one, run, withTransaction } = require('../../db');
const blob = require('../../storage/blob');

// Habillages de la page de connexion. Image stockée en Blob (clé) ou BYTEA (repli dev),
// comme les autres médias. Un seul habillage actif à la fois (voir activate()).

const HAS_IMAGE = '(image_data IS NOT NULL OR image_key IS NOT NULL) AS has_image';

async function list() {
  return all(
    `SELECT id, nom, message, actif, ${HAS_IMAGE}, updated_at
       FROM login_backgrounds ORDER BY created_at DESC`
  );
}

async function get(id) {
  return one(
    `SELECT id, nom, message, actif, ${HAS_IMAGE}, updated_at
       FROM login_backgrounds WHERE id = $1`,
    [id]
  );
}

async function create({ nom, message }) {
  const row = await one(
    `INSERT INTO login_backgrounds (nom, message) VALUES ($1, $2)
     RETURNING id, nom, message, actif, false AS has_image, updated_at`,
    [nom, message || null]
  );
  return row;
}

async function update(id, { nom, message }) {
  await run(
    `UPDATE login_backgrounds
        SET nom = COALESCE($2, nom), message = $3, updated_at = now()
      WHERE id = $1`,
    [id, nom || null, message || null]
  );
  return get(id);
}

async function setImage(id, buffer, mime) {
  const prev = await one('SELECT image_key FROM login_backgrounds WHERE id = $1', [id]);
  const key = await blob.putBuffer(buffer, mime, 'login-bg');
  await run(
    `UPDATE login_backgrounds
        SET image_data = $2, image_key = $3, image_mime = $4, updated_at = now()
      WHERE id = $1`,
    [id, key ? null : buffer, key, mime]
  );
  if (prev && prev.image_key && prev.image_key !== key) await blob.del(prev.image_key);
  return get(id);
}

async function remove(id) {
  const row = await one('SELECT image_key FROM login_backgrounds WHERE id = $1', [id]);
  if (row && row.image_key) await blob.del(row.image_key);
  await run('DELETE FROM login_backgrounds WHERE id = $1', [id]);
}

// Active/désactive un habillage. À l'activation, désactive d'abord tous les autres
// (un seul actif à la fois) dans une transaction.
async function activate(id, actif) {
  return withTransaction(async (tx) => {
    if (actif) {
      await tx.run('UPDATE login_backgrounds SET actif = false, updated_at = now() WHERE actif = true AND id <> $1', [id]);
      await tx.run('UPDATE login_backgrounds SET actif = true, updated_at = now() WHERE id = $1', [id]);
    } else {
      await tx.run('UPDATE login_backgrounds SET actif = false, updated_at = now() WHERE id = $1', [id]);
    }
    return tx.one(
      `SELECT id, nom, message, actif, ${HAS_IMAGE}, updated_at FROM login_backgrounds WHERE id = $1`,
      [id]
    );
  });
}

// Habillage actif exposé publiquement (page de connexion). null si aucun.
async function getActive() {
  return one(
    `SELECT id, nom, message, ${HAS_IMAGE}
       FROM login_backgrounds WHERE actif = true LIMIT 1`
  );
}

// Octets de l'image d'un habillage (pour le service HTTP).
async function getImageBytes(id) {
  const row = await one('SELECT image_data, image_key, image_mime FROM login_backgrounds WHERE id = $1', [id]);
  if (!row || (!row.image_data && !row.image_key)) return null;
  const buffer = row.image_key ? await blob.getBuffer(row.image_key) : row.image_data;
  return { buffer, mime: row.image_mime || 'application/octet-stream' };
}

module.exports = { list, get, create, update, setImage, remove, activate, getActive, getImageBytes };
