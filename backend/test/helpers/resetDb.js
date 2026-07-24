const env = require('../../src/config/env');
const { pool } = require('../../src/db');

// Repart d'un schéma vierge avant chaque exécution de la suite e2e (base de test dédiée uniquement).
// Garde-fou : on refuse de DROP une base qui ne ressemble pas explicitement à une base de test,
// pour ne jamais effacer par accident les données d'un environnement de développement.
async function resetDatabase() {
  if (!/test/i.test(env.databaseUrl)) {
    throw new Error(
      `Refus de réinitialiser une base qui ne semble pas être une base de test : ${env.databaseUrl}\n` +
      'Vérifiez que NODE_ENV=test est bien positionné (voir .env.test).'
    );
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

module.exports = { resetDatabase };
