// Stockage des médias sur Azure Blob (container privé).
//
// Le backend reste l'intermédiaire : il UPLOAD le buffer (multer memoryStorage)
// vers le Blob et stocke une CLÉ (au lieu du BYTEA), puis à la lecture il
// TÉLÉCHARGE le blob et le sert (res.send) — les endpoints et le frontend ne
// changent pas, les contrôles d'accès existants sont préservés.
//
// Compat ascendante : si le stockage n'est pas configuré (dev local sans
// AZURE_STORAGE_CONNECTION_STRING), putBuffer renvoie null et l'appelant
// retombe sur l'ancien stockage BYTEA. À la lecture, une ligne sans clé sert
// son BYTEA historique.

const { BlobServiceClient } = require('@azure/storage-blob');
const { randomUUID } = require('crypto');

const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
const container = process.env.AZURE_STORAGE_CONTAINER || 'ccgflow';
let client = null;

function enabled() {
  return !!conn;
}

function containerClient() {
  if (!client) client = BlobServiceClient.fromConnectionString(conn);
  return client.getContainerClient(container);
}

function extFromMime(mime) {
  if (!mime) return 'bin';
  const sub = mime.split('/')[1];
  if (!sub) return 'bin';
  return sub.split('+')[0].split(';')[0] || 'bin';
}

// Upload un buffer, renvoie la clé blob. null si stockage désactivé (=> l'appelant garde le BYTEA).
async function putBuffer(buffer, mime, prefix) {
  if (!enabled() || !buffer) return null;
  const key = `${prefix}/${randomUUID()}.${extFromMime(mime)}`;
  await containerClient().getBlockBlobClient(key).uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mime || 'application/octet-stream' },
  });
  return key;
}

// Télécharge un blob en Buffer. null si pas de clé / stockage désactivé.
async function getBuffer(key) {
  if (!key || !enabled()) return null;
  return containerClient().getBlockBlobClient(key).downloadToBuffer();
}

// Supprime un blob (au remplacement / suppression). Silencieux.
async function del(key) {
  if (!key || !enabled()) return;
  try {
    await containerClient().getBlockBlobClient(key).deleteIfExists();
  } catch {
    /* best-effort */
  }
}

module.exports = { enabled, putBuffer, getBuffer, del };
