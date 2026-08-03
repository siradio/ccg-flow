const crypto = require('crypto');
const env = require('../config/env');

// Chiffrement symétrique des secrets stockés en base (aujourd'hui : le mot de passe SMTP
// configurable depuis l'admin). Objectif : un dump de la base ou une sauvegarde ne doit pas
// révéler le mot de passe en clair. La clé n'est jamais stockée — elle est dérivée de JWT_SECRET
// (déjà le secret racine de l'app) via scrypt. Conséquence assumée : si JWT_SECRET change, les
// secrets déjà chiffrés deviennent illisibles (decrypt renvoie null) et doivent être ressaisis —
// acceptable pour une poignée de champs de config, et cohérent avec le fait que changer JWT_SECRET
// invalide déjà toutes les sessions.
const KEY = crypto.scryptSync(env.jwtSecret, 'ccg-flow-settings-salt', 32);
const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

// Format : "enc:v1:<iv b64>:<tag b64>:<ciphertext b64>". Le préfixe permet de distinguer une valeur
// chiffrée d'une valeur en clair (migration douce / champs laissés vides).
function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, enc].map(b => b.toString('base64')).join(':');
}

// Renvoie le texte en clair, ou null si la valeur est illisible (secret chiffré avec un autre
// JWT_SECRET, données corrompues...). Une valeur sans le préfixe est considérée comme déjà en clair
// et renvoyée telle quelle (tolérance en cas de saisie manuelle directe en base).
function decrypt(value) {
  if (value === undefined || value === null || value === '') return '';
  if (!String(value).startsWith(PREFIX)) return String(value);
  try {
    const [ivB64, tagB64, dataB64] = String(value).slice(PREFIX.length).split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted };
