const { all, one, run, withTransaction } = require('../../db');
const blob = require('../../storage/blob');
const settings = require('../settings/settings.service');

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

// ─── Bandeau d'informations défilant (ticker) ───────────────────────────────────────────────
// Configuration GLOBALE (indépendante des habillages) stockée dans app_settings : activation,
// messages (un par ligne) et vitesse de défilement. Exposée publiquement sur la page de connexion.
const TICKER = { enabled: 'login_ticker_enabled', messages: 'login_ticker_messages', speed: 'login_ticker_speed' };
const TICKER_SPEEDS = ['slow', 'normal', 'fast'];

async function getTicker() {
  const enabled = (await settings.getValue(TICKER.enabled, 'false')) === 'true';
  const raw = (await settings.getValue(TICKER.messages, '')) || '';
  const messages = raw.split('\n').map(s => s.trim()).filter(Boolean);
  let speed = (await settings.getValue(TICKER.speed, 'normal')) || 'normal';
  if (!TICKER_SPEEDS.includes(speed)) speed = 'normal';
  return { enabled, messages, speed };
}

async function setTicker({ enabled, messages, speed }) {
  if (enabled !== undefined) await settings.setValue(TICKER.enabled, enabled ? 'true' : 'false');
  if (messages !== undefined) {
    const value = Array.isArray(messages) ? messages.join('\n') : String(messages || '');
    await settings.setValue(TICKER.messages, value);
  }
  if (speed !== undefined) await settings.setValue(TICKER.speed, TICKER_SPEEDS.includes(speed) ? speed : 'normal');
  return getTicker();
}

module.exports = { list, get, create, update, setImage, remove, activate, getActive, getImageBytes, getTicker, setTicker };
