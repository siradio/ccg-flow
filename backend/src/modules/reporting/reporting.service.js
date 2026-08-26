const { run } = require('../../db');
const { sendMail, renderMailTemplate } = require('../../utils/mailer');
const { generateReport } = require('./report-generators');

// Destinataires : liste séparée par , ; ou espaces ; on garde ce qui ressemble à un e-mail.
function parseRecipients(s) {
  return String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(x => x.includes('@'));
}

// Heure/jour locaux (Africa/Conakry, UTC+0) via Intl — robuste quel que soit le fuseau du serveur.
function conakryParts(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Conakry', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, day: Number(p.day), weekday: wd[p.weekday] };
}

// Une planification est-elle « due » maintenant ? (jour de fréquence + heure atteinte + pas déjà envoyée aujourd'hui)
function isDue(s, now = new Date()) {
  const { ymd, hm, day, weekday } = conakryParts(now);
  if (s.frequence === 'hebdomadaire' && Number(s.jour_semaine) !== weekday) return false;
  if (s.frequence === 'mensuel' && Number(s.jour_mois) !== day) return false;
  if (hm < (s.heure || '07:00')) return false; // comparaison "HH:MM" lexicographique = OK
  if (s.last_run_at && conakryParts(new Date(s.last_run_at)).ymd === ymd) return false; // déjà envoyée aujourd'hui
  return true;
}

async function logRun(scheduleId, statut, destinataires, message, userId) {
  await run(`INSERT INTO report_runs (schedule_id, statut, destinataires, message, declenche_par) VALUES ($1,$2,$3,$4,$5)`,
    [scheduleId, statut, destinataires, message, userId || null]);
}

// Génère et envoie un rapport ; met à jour last_run_at/status et historise.
async function runSchedule(schedule, opts = {}) {
  const recipients = parseRecipients(schedule.destinataires);
  if (!recipients.length) {
    await logRun(schedule.id, 'skipped', schedule.destinataires, 'Aucun destinataire', opts.userId);
    return { statut: 'skipped', message: 'Aucun destinataire configuré.' };
  }
  try {
    const { subject, bodyHtml, attachments } = await generateReport(schedule.code, schedule);
    const html = renderMailTemplate({ title: subject, bodyHtml });
    await sendMail({ to: recipients.join(','), subject, html, text: subject, attachments });
    await run(`UPDATE report_schedules SET last_run_at = now(), last_status = 'ok', last_error = NULL, updated_at = now() WHERE id = $1`, [schedule.id]);
    await logRun(schedule.id, 'ok', recipients.join(', '), `${attachments.length} pièce(s) jointe(s)`, opts.userId);
    return { statut: 'ok', message: `Envoyé à ${recipients.length} destinataire(s).` };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).slice(0, 500);
    await run(`UPDATE report_schedules SET last_run_at = now(), last_status = 'error', last_error = $2, updated_at = now() WHERE id = $1`, [schedule.id, msg]);
    await logRun(schedule.id, 'error', recipients.join(', '), msg, opts.userId);
    return { statut: 'error', message: msg };
  }
}

module.exports = { runSchedule, isDue, parseRecipients, conakryParts };
