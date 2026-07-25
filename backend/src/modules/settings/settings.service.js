const { all, one, run } = require('../../db');

async function getAll() {
  const rows = await all('SELECT key, value FROM app_settings ORDER BY key');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
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

module.exports = { getAll, getValue, getIntValue, setValue };
