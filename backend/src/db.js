const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const env = require('./config/env');

// Azure Database for PostgreSQL exige TLS (contrairement au Postgres Docker local, sans SSL) —
// activé explicitement plutôt que de compter sur le parsing implicite de "sslmode=require" dans
// la chaîne de connexion, pour ne pas dépendre du comportement interne de pg/pg-connection-string.
// `rejectUnauthorized: false` : approche standard recommandée par Azure pour Node/pg, la chaîne de
// certification d'Azure n'étant pas systématiquement dans le magasin CA par défaut de Node.
const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: /\bsslmode=require\b/.test(env.databaseUrl || '') ? { rejectUnauthorized: false } : false,
});

async function all(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}
async function one(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}
async function run(text, params = []) {
  return pool.query(text, params);
}

// Exécute les fichiers migrations/*.sql dans l'ordre alphabétique, une seule fois chacun.
async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const already = await one('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (already) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  ✓ migration appliquée : ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`Échec migration ${file} : ${e.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { pool, all, one, run, runMigrations };
