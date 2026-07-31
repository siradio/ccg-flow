const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;
function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

// Coupe-circuit court : un serveur SMTP qui rejette l'authentification (ex. politique tenant M365
// désactivant SmtpClientAuthentication, déjà rencontrée sur cet environnement) ne se remet pas à
// fonctionner d'une milliseconde à l'autre — retenter immédiatement chaque envoi suivant ne fait
// que payer une deuxième fois la même poignée de main réseau + rejet (plusieurs secondes) pour un
// résultat connu d'avance. Après un échec, les appels suivants échouent instantanément pendant ce
// délai plutôt que de retenter en vain — critique dès qu'un appelant envoie plusieurs mails de
// suite (ex. notifications en cascade du workflow, génération de données de test).
const RETRY_COOLDOWN_MS = 60_000;
let brokenUntil = 0;
let lastError = null;

// En dev/test sans SMTP configuré : log en console au lieu d'échouer, pour ne pas bloquer le workflow.
async function sendMail({ to, subject, text, html, attachments }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer:dev] À: ${to} | Sujet: ${subject}${attachments ? ` | ${attachments.length} pièce(s) jointe(s)` : ''}`);
    return { dev: true, to, subject };
  }
  if (Date.now() < brokenUntil) {
    throw lastError || new Error('Serveur SMTP indisponible (dernier échec récent).');
  }
  try {
    const result = await t.sendMail({ from: env.smtp.from, to, subject, text, html, attachments });
    brokenUntil = 0;
    return result;
  } catch (e) {
    brokenUntil = Date.now() + RETRY_COOLDOWN_MS;
    lastError = e;
    throw e;
  }
}

module.exports = { sendMail };
