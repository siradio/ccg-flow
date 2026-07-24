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

// En dev/test sans SMTP configuré : log en console au lieu d'échouer, pour ne pas bloquer le workflow.
async function sendMail({ to, subject, text, html, attachments }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer:dev] À: ${to} | Sujet: ${subject}${attachments ? ` | ${attachments.length} pièce(s) jointe(s)` : ''}`);
    return { dev: true, to, subject };
  }
  return t.sendMail({ from: env.smtp.from, to, subject, text, html, attachments });
}

module.exports = { sendMail };
