const { one, run } = require('../../db');

// Trois éléments de branding par entité, stockés dans des colonnes dédiées de `entities`.
const KINDS = {
  logo: { data: 'logo', mime: 'logo_mime' },
  signature: { data: 'signature', mime: 'signature_mime' },
  stamp: { data: 'stamp', mime: 'stamp_mime' },
};

function isValidKind(kind) {
  return Object.prototype.hasOwnProperty.call(KINDS, kind);
}

// Renvoie { data: Buffer, mime } pour un élément, ou null s'il n'est pas défini.
async function getBranding(entityId, kind) {
  const cols = KINDS[kind];
  const row = await one(`SELECT ${cols.data} AS data, ${cols.mime} AS mime FROM entities WHERE id = $1`, [entityId]);
  if (!row || !row.data) return null;
  return { data: row.data, mime: row.mime || 'application/octet-stream' };
}

async function setBranding(entityId, kind, buffer, mime) {
  const cols = KINDS[kind];
  await run(`UPDATE entities SET ${cols.data} = $1, ${cols.mime} = $2 WHERE id = $3`, [buffer, mime, entityId]);
}

async function clearBranding(entityId, kind) {
  const cols = KINDS[kind];
  await run(`UPDATE entities SET ${cols.data} = NULL, ${cols.mime} = NULL WHERE id = $1`, [entityId]);
}

// Indique quels éléments sont définis (sans transférer les images) — pour l'écran d'administration.
async function getBrandingFlags(entityId) {
  const row = await one(
    `SELECT logo IS NOT NULL AS logo, signature IS NOT NULL AS signature, stamp IS NOT NULL AS stamp
     FROM entities WHERE id = $1`,
    [entityId]
  );
  return row || { logo: false, signature: false, stamp: false };
}

// Buffers des trois images d'une entité (ou null), pour la génération des PDF.
async function getEntityImages(entityId) {
  const row = await one('SELECT logo, signature, stamp FROM entities WHERE id = $1', [entityId]);
  return {
    logo: row?.logo || null,
    signature: row?.signature || null,
    stamp: row?.stamp || null,
  };
}

module.exports = { KINDS, isValidKind, getBranding, setBranding, clearBranding, getBrandingFlags, getEntityImages };
