const cron = require('node-cron');
const { all, one, run } = require('../../db');
const { runSchedule, isDue } = require('./reporting.service');

// Scheduler des rapports planifiés. Un tick toutes les 15 min évalue les planifications dues et les
// exécute. Verrou consultatif Postgres (pg_try_advisory_lock) → une seule instance envoie, même en
// cas de scale-out. La garde last_run_at (dans isDue/runSchedule) évite tout double envoi.
let started = false;

async function tick() {
  const schedules = await all(`SELECT * FROM report_schedules WHERE actif = true`);
  for (const s of schedules) {
    if (!isDue(s)) continue;
    const lock = await one(`SELECT pg_try_advisory_lock(hashtext('report_schedule:' || $1::text)) AS ok`, [s.id]);
    if (!lock || !lock.ok) continue;
    try {
      const fresh = await one('SELECT * FROM report_schedules WHERE id = $1', [s.id]);
      if (fresh && fresh.actif && isDue(fresh)) await runSchedule(fresh, {});
    } catch (e) {
      console.error('report scheduler run error (schedule ' + s.id + '):', e.message);
    } finally {
      await run(`SELECT pg_advisory_unlock(hashtext('report_schedule:' || $1::text))`, [s.id]);
    }
  }
}

function startReportScheduler() {
  if (started) return;
  started = true;
  // Toutes les 15 minutes, en heure de Conakry (UTC+0).
  cron.schedule('*/15 * * * *', () => { tick().catch(e => console.error('report scheduler tick error:', e.message)); }, { timezone: 'Africa/Conakry' });
  console.log('   🗓️  Scheduler de rapports planifiés démarré (tick /15 min).');
}

module.exports = { startReportScheduler, tick };
