const nodemailer = require('nodemailer');
const path = require('path');
const env = require('../config/env');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo-ccg.png');
const LOGO_CID = 'logo-ccg';

// Gabarit HTML commun à tous les emails envoyés par l'application, avec le logo CCG
// affiché en en-tête (image jointe en inline via cid, pas de dépendance à une URL externe).
function renderMailTemplate({ title, bodyHtml }) {
  return `
<!DOCTYPE html>
<html lang="fr">
  <body style="margin:0; padding:0; background-color:#f4f5f7; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; max-width:600px;">
            <tr>
              <td style="background-color:#0b3d64; padding:20px 24px; text-align:center;">
                <img src="cid:${LOGO_CID}" alt="CCG" height="40" style="display:inline-block; height:40px;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px 24px; color:#1f2937; font-size:14px; line-height:1.6;">
                ${title ? `<h2 style="margin:0 0 16px; color:#0b3d64; font-size:18px;">${title}</h2>` : ''}
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px; background-color:#f4f5f7; color:#6b7280; font-size:12px; text-align:center;">
                Ceci est un message automatique — merci de ne pas y répondre directement.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

let transporter = null;
function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: false, // pas de TLS en local
      ignoreTLS: true, // ignire en local
      //auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
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
  // Le logo n'est joint (en inline, via cid) que si un corps HTML utilise le gabarit ci-dessus.
  const allAttachments = html
    ? [...(attachments || []), { filename: 'logo-ccg.png', path: LOGO_PATH, cid: LOGO_CID }]
    : attachments;
  if (!t) {
    console.log(`[mailer:dev] À: ${to} | Sujet: ${subject}${allAttachments ? ` | ${allAttachments.length} pièce(s) jointe(s)` : ''}`);
    return { dev: true, to, subject };
  }
  if (Date.now() < brokenUntil) {
    throw lastError || new Error('Serveur SMTP indisponible (dernier échec récent).');
  }
  try {
    const result = await t.sendMail({ from: env.smtp.from, to, subject, text, html, attachments: allAttachments });
    brokenUntil = 0;
    return result;
  } catch (e) {
    brokenUntil = Date.now() + RETRY_COOLDOWN_MS;
    lastError = e;
    throw e;
  }
}

module.exports = { sendMail, renderMailTemplate };
