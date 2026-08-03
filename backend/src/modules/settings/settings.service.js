const { all, one, run } = require('../../db');
const env = require('../../config/env');
const { encrypt, decrypt } = require('../../utils/crypto');

// Clés de configuration SMTP stockées dans app_settings, éditables depuis l'admin (super_admin).
// Elles sont EXCLUES du GET /settings public (lisible par tout utilisateur authentifié) : ce sont
// des données d'infrastructure, et smtp_pass est un secret. Elles ne transitent que par les routes
// dédiées /settings/smtp, réservées au super_admin, et smtp_pass n'est jamais renvoyé au client.
const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_secure'];
const HIDDEN_KEYS = new Set(SMTP_KEYS);

// Compteur incrémenté à chaque écriture de la config SMTP : le mailer compare cette valeur à celle
// de son transporteur en cache pour le reconstruire quand l'admin modifie les paramètres, sans
// redémarrage du serveur.
let smtpConfigVersion = 0;

async function getAll() {
  const rows = await all('SELECT key, value FROM app_settings ORDER BY key');
  return Object.fromEntries(rows.filter(r => !HIDDEN_KEYS.has(r.key)).map(r => [r.key, r.value]));
}

async function getValue(key, fallback = null) {
  const row = await one('SELECT value FROM app_settings WHERE key = $1', [key]);
  return row ? row.value : fallback;
}

async function getIntValue(key, fallback) {
  const value = await getValue(key);
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function setValue(key, value) {
  await run(
    `INSERT INTO app_settings (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
  return getValue(key);
}

// --- Configuration SMTP ---------------------------------------------------------------------

function smtpVersion() {
  return smtpConfigVersion;
}

// Config effective utilisée par le mailer : chaque champ vient de la base s'il y est défini, sinon
// de la variable d'environnement correspondante (compatibilité ascendante + tests). Le mot de passe
// est déchiffré ici pour usage interne uniquement (jamais exposé par une route).
async function getSmtpConfig() {
  const rows = await all('SELECT key, value FROM app_settings WHERE key = ANY($1)', [SMTP_KEYS]);
  const db = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const has = k => db[k] !== undefined && db[k] !== '';
  const pick = (k, envVal) => (has(k) ? db[k] : envVal);
  const decrypted = has('smtp_pass') ? decrypt(db.smtp_pass) : env.smtp.pass;
  const port = Number(pick('smtp_port', env.smtp.port)) || 587;
  return {
    host: pick('smtp_host', env.smtp.host),
    port,
    user: pick('smtp_user', env.smtp.user),
    // null = secret illisible (JWT_SECRET changé depuis le chiffrement) : traité comme absent.
    pass: decrypted === null ? '' : decrypted,
    from: pick('smtp_from', env.smtp.from),
    secure: has('smtp_secure') ? String(db.smtp_secure) === 'true' : port === 465,
    version: smtpConfigVersion,
  };
}

// Vue destinée à l'écran d'administration : jamais le mot de passe en clair. On indique seulement
// s'il est défini, et si la config est pilotée par la base ou héritée du .env.
async function getSmtpConfigForAdmin() {
  const rows = await all('SELECT key, value FROM app_settings WHERE key = ANY($1)', [SMTP_KEYS]);
  const db = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const has = k => db[k] !== undefined && db[k] !== '';
  const passInDb = has('smtp_pass') && !!decrypt(db.smtp_pass);
  return {
    host: has('smtp_host') ? db.smtp_host : (env.smtp.host || ''),
    port: has('smtp_port') ? db.smtp_port : String(env.smtp.port || 587),
    user: has('smtp_user') ? db.smtp_user : (env.smtp.user || ''),
    from: has('smtp_from') ? db.smtp_from : (env.smtp.from || ''),
    secure: has('smtp_secure') ? String(db.smtp_secure) === 'true' : Number(env.smtp.port) === 465,
    passwordSet: passInDb || (!has('smtp_pass') && !!env.smtp.pass),
    // true si au moins un champ est piloté par la base (sinon tout vient encore du .env)
    fromDb: SMTP_KEYS.some(has),
  };
}

// Écrit la config SMTP. Chaque champ n'est mis à jour que s'il est fourni (undefined = inchangé).
// Cas particulier du mot de passe : undefined = garder l'existant (le formulaire ne le renvoie pas
// puisqu'il n'est jamais affiché) ; '' = effacer ; toute autre valeur = chiffrer et remplacer.
async function setSmtpConfig(fields = {}) {
  const updates = [];
  const map = { host: 'smtp_host', port: 'smtp_port', user: 'smtp_user', from: 'smtp_from' };
  for (const [field, key] of Object.entries(map)) {
    if (fields[field] !== undefined) updates.push([key, String(fields[field])]);
  }
  if (fields.secure !== undefined) updates.push(['smtp_secure', fields.secure ? 'true' : 'false']);
  if (fields.password !== undefined) {
    updates.push(['smtp_pass', fields.password === '' ? '' : encrypt(fields.password)]);
  }
  for (const [key, value] of updates) {
    await run(
      `INSERT INTO app_settings (key, value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
  smtpConfigVersion += 1;
  return getSmtpConfigForAdmin();
}

module.exports = {
  getAll, getValue, getIntValue, setValue,
  getSmtpConfig, getSmtpConfigForAdmin, setSmtpConfig, smtpVersion,
};
