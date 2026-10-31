const { all } = require('../../db');
const settings = require('../settings/settings.service');
const { notify } = require('../notifications/notifications.service');

// Rappel hebdomadaire « demande de journaliers » : chaque VENDREDI, on rappelle aux directeurs de BU
// (rôle `responsable`) de saisir leur demande de journaliers pour la semaine suivante. Même modèle
// que les autres alertes planifiées (vérif quotidienne, garde anti-doublon via app_settings).
async function runReminder(force = false) {
  const now = new Date();
  if (!force && now.getDay() !== 5) return; // 5 = vendredi
  if (!force) {
    const today = now.toISOString().slice(0, 10);
    const last = await settings.getValue('journaliers_reminder_last_sent', '');
    if (last === today) return; // déjà envoyé aujourd'hui (robuste au redémarrage)
    await settings.setValue('journaliers_reminder_last_sent', today);
  }
  const directors = await all(
    `SELECT DISTINCT u.id FROM users u JOIN user_entity_roles r ON r.user_id = u.id
      WHERE u.actif = true AND r.role_code = 'responsable'`);
  for (const d of directors) {
    try {
      await notify(d.id, 'Demande de journaliers — semaine prochaine',
        'Merci de saisir votre demande de journaliers pour la semaine prochaine (lundi → dimanche). La demande suit le circuit DAF → DGA → RH.',
        '/rh/demandes/journaliers/new');
    } catch (_e) { /* non bloquant */ }
  }
  return { notified: directors.length };
}

let started = false;
function startJournaliersReminder() {
  if (started) return; started = true;
  setTimeout(() => {
    runReminder().catch(() => {});
    setInterval(() => runReminder().catch(() => {}), 24 * 60 * 60 * 1000);
  }, 90 * 1000);
}

module.exports = { startJournaliersReminder, runReminder };
