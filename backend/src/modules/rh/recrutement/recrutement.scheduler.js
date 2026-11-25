const cron = require('node-cron');
const { all, one, run } = require('../../../db');
const { finalizeAttempt } = require('./recrutement.public.routes');

// Clôture serveur des tentatives expirées : indépendant du navigateur du candidat (une fermeture
// d'onglet ne doit pas empêcher la finalisation). Verrou consultatif Postgres → une seule instance
// traite, même en scale-out. Toutes les 2 minutes.
let started = false;

async function tick() {
  const lock = await one("SELECT pg_try_advisory_lock(hashtext('recrutement_expiry')) AS ok");
  if (!lock || !lock.ok) return; // une autre instance s'en occupe
  try {
    const due = await all("SELECT id FROM rh_recrutement_attempts WHERE statut = 'en_cours' AND expires_at < now() ORDER BY id LIMIT 200");
    for (const a of due) {
      try { await finalizeAttempt(a.id, { expired: true }); }
      catch (e) { console.error('recrutement expiry finalize', a.id, e.message); }
    }
  } finally {
    await run("SELECT pg_advisory_unlock(hashtext('recrutement_expiry'))");
  }
}

function startRecrutementExpiry() {
  if (started) return; started = true;
  cron.schedule('*/2 * * * *', () => { tick().catch(e => console.error('recrutement expiry tick error:', e.message)); }, { timezone: 'Africa/Conakry' });
}

module.exports = { startRecrutementExpiry };
