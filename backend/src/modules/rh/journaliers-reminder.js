const { all } = require('../../db');
const settings = require('../settings/settings.service');
const { notify } = require('../notifications/notifications.service');
const { getJournaliersConfig } = require('./rh.service');

// Rappel hebdomadaire « demande de journaliers » : chaque VENDREDI, on rappelle aux directeurs de BU
// (rôle `responsable`) de saisir leur demande de journaliers pour la semaine suivante. Même modèle
// que les autres alertes planifiées (vérif quotidienne, garde anti-doublon via app_settings).
async function runReminder(force = false) {
  const now = new Date();
  if (!force) {
    const cfg = await getJournaliersConfig();    // jour + heure de rappel configurables (RH → Config)
    if (now.getDay() !== cfg.jour) return;
    if (now.getHours() < cfg.rappel_heure) return; // rappel à partir de l'heure configurée (serveur UTC ≈ Conakry)
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
        'Merci de saisir votre demande de journaliers pour la semaine prochaine (lundi → dimanche). La demande suit le circuit DAF → RH.',
        '/rh/demandes/journaliers/new');
    } catch (_e) { /* non bloquant */ }
  }
  return { notified: directors.length };
}

let started = false;
function startJournaliersReminder() {
  if (started) return; started = true;
  // Vérification toutes les 30 min : le rappel part dès le vendredi 8h (garde anti-doublon
  // quotidienne), au lieu d'un unique passage quotidien calé sur l'heure de démarrage du serveur.
  setTimeout(() => {
    runReminder().catch(() => {});
    setInterval(() => runReminder().catch(() => {}), 30 * 60 * 1000);
  }, 90 * 1000);
}

module.exports = { startJournaliersReminder, runReminder };
