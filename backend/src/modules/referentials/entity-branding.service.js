const { one, run } = require('../../db');
const blob = require('../../storage/blob');

// Trois éléments de branding par entité, stockés dans des colonnes dédiées de `entities`.
// Le binaire migre vers Azure Blob (colonne <col>_key) ; le BYTEA est conservé pour compat.
const KINDS = {
  logo: { data: 'logo', mime: 'logo_mime', key: 'logo_key' },
  signature: { data: 'signature', mime: 'signature_mime', key: 'signature_key' },
  stamp: { data: 'stamp', mime: 'stamp_mime', key: 'stamp_key' },
};

function isValidKind(kind) {
  return Object.prototype.hasOwnProperty.call(KINDS, kind);
}

// Renvoie { data: Buffer, mime } pour un élément, ou null s'il n'est pas défini.
async function getBranding(entityId, kind) {
  const cols = KINDS[kind];
  const row = await one(
    `SELECT ${cols.data} AS data, ${cols.mime} AS mime, ${cols.key} AS key FROM entities WHERE id = $1`,
    [entityId]
  );
  if (!row || (!row.data && !row.key)) return null;
  const data = row.key ? await blob.getBuffer(row.key) : row.data;
  if (!data) return null;
  return { data, mime: row.mime || 'application/octet-stream' };
}

async function setBranding(entityId, kind, buffer, mime) {
  const cols = KINDS[kind];
  const key = await blob.putBuffer(buffer, mime, 'branding');
  await run(
    `UPDATE entities SET ${cols.data} = $1, ${cols.key} = $2, ${cols.mime} = $3 WHERE id = $4`,
    [key ? null : buffer, key, mime, entityId]
  );
}

async function clearBranding(entityId, kind) {
  const cols = KINDS[kind];
  const row = await one(`SELECT ${cols.key} AS key FROM entities WHERE id = $1`, [entityId]);
  if (row && row.key) await blob.del(row.key);
  await run(`UPDATE entities SET ${cols.data} = NULL, ${cols.key} = NULL, ${cols.mime} = NULL WHERE id = $1`, [entityId]);
}

// Indique quels éléments sont définis (sans transférer les images) — pour l'écran d'administration.
async function getBrandingFlags(entityId) {
  const row = await one(
    `SELECT (logo IS NOT NULL OR logo_key IS NOT NULL) AS logo,
            (signature IS NOT NULL OR signature_key IS NOT NULL) AS signature,
            (stamp IS NOT NULL OR stamp_key IS NOT NULL) AS stamp
     FROM entities WHERE id = $1`,
    [entityId]
  );
  return row || { logo: false, signature: false, stamp: false };
}

// Buffers des trois images d'une entité (ou null), pour la génération des PDF.
async function getEntityImages(entityId) {
  const row = await one(
    'SELECT logo, signature, stamp, logo_key, signature_key, stamp_key FROM entities WHERE id = $1',
    [entityId]
  );
  if (!row) return { logo: null, signature: null, stamp: null };
  const [logo, signature, stamp] = await Promise.all([
    row.logo_key ? blob.getBuffer(row.logo_key) : (row.logo || null),
    row.signature_key ? blob.getBuffer(row.signature_key) : (row.signature || null),
    row.stamp_key ? blob.getBuffer(row.stamp_key) : (row.stamp || null),
  ]);
  return { logo, signature, stamp };
}

module.exports = { KINDS, isValidKind, getBranding, setBranding, clearBranding, getBrandingFlags, getEntityImages };
