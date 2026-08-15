const nodemailer = require('nodemailer');
const path = require('path');
const settings = require('../modules/settings/settings.service');
const graphMailer = require('./graphMailer');

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

// Construit un transporteur nodemailer à partir d'une config résolue (base -> .env, voir
// settings.service.getSmtpConfig). Renvoie null si aucun hôte n'est configuré.
function buildTransporter(cfg) {
  if (!cfg || !cfg.host) return null;
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    // TLS implicite uniquement sur le port 465 ; le port 587 (Brevo, M365, la plupart des relais)
    // utilise STARTTLS, négocié automatiquement par nodemailer tant que `secure` est à false et
    // qu'`ignoreTLS` n'est pas forcé — d'où son retrait, il désactivait purement et simplement le
    // chiffrement et empêchait toute authentification réelle de fonctionner.
    secure: !!cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

// La config SMTP est désormais éditable en base (Admin -> Email) sans redéploiement : on relit la
// config à chaque envoi et on ne reconstruit le transporteur que lorsque sa "version" a changé
// (compteur incrémenté par settings.setSmtpConfig), pour ne pas recréer un transporteur à chaque mail.
let cached = { version: -1, transporter: null };
async function getTransporter() {
  const cfg = await settings.getSmtpConfig();
  if (cached.version !== cfg.version) {
    cached = { version: cfg.version, transporter: buildTransporter(cfg) };
  }
  return { transporter: cached.transporter, cfg };
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

// Ordre des canaux d'envoi : Microsoft Graph (OAuth2) si configuré, sinon SMTP, sinon (dev/test sans
// rien de configuré) log en console au lieu d'échouer, pour ne pas bloquer le workflow.
async function sendMail({ to, cc, subject, text, html, attachments }) {
  // Le logo n'est joint (en inline, via cid) que si un corps HTML utilise le gabarit ci-dessus.
  const allAttachments = html
    ? [...(attachments || []), { filename: 'logo-ccg.png', path: LOGO_PATH, cid: LOGO_CID, contentType: 'image/png' }]
    : attachments;

  // 1) Microsoft Graph (recommandé depuis la fin du Basic Auth SMTP), prioritaire dès qu'il est configuré.
  if (graphMailer.isGraphConfigured()) {
    if (Date.now() < brokenUntil) throw lastError || new Error('Envoi email indisponible (dernier échec récent).');
    try {
      const r = await graphMailer.sendViaGraph({ to, cc, subject, text, html, attachments: allAttachments });
      brokenUntil = 0;
      return r;
    } catch (e) {
      brokenUntil = Date.now() + RETRY_COOLDOWN_MS;
      lastError = e;
      throw e;
    }
  }

  // 2) SMTP classique (repli).
  const { transporter, cfg } = await getTransporter();
  if (!transporter) {
    console.log(`[mailer:dev] À: ${to} | Sujet: ${subject}${allAttachments ? ` | ${allAttachments.length} pièce(s) jointe(s)` : ''}`);
    return { dev: true, to, subject };
  }
  if (Date.now() < brokenUntil) {
    throw lastError || new Error('Serveur SMTP indisponible (dernier échec récent).');
  }
  try {
    const result = await transporter.sendMail({ from: cfg.from, to, cc: cc || undefined, subject, text, html, attachments: allAttachments });
    brokenUntil = 0;
    return result;
  } catch (e) {
    brokenUntil = Date.now() + RETRY_COOLDOWN_MS;
    lastError = e;
    throw e;
  }
}

// Envoi d'un email de test depuis l'écran d'administration, avec la config SMTP actuellement
// enregistrée (base -> .env). Volontairement HORS du coupe-circuit `brokenUntil` : on veut une
// tentative réelle immédiate et l'erreur brute remontée à l'admin (pour diagnostiquer identifiants
// / hôte / port), et pouvoir retester aussitôt après correction sans attendre le cooldown.
async function sendTestMail({ to }) {
  const testHtml = renderMailTemplate({
    title: 'Test de configuration email',
    bodyHtml: '<p>Cet email confirme que la configuration email de <strong>CCG Flow</strong> est fonctionnelle. ✅</p><p>Vous pouvez fermer ce message.</p>',
  });
  const testAtt = [{ filename: 'logo-ccg.png', path: LOGO_PATH, cid: LOGO_CID, contentType: 'image/png' }];

  // Graph prioritaire : on veut tester le canal réellement utilisé pour les envois.
  if (graphMailer.isGraphConfigured()) {
    const r = await graphMailer.sendViaGraph({
      to, subject: 'CCG Flow — email de test',
      text: 'Cet email confirme que la configuration email de CCG Flow est fonctionnelle.',
      html: testHtml, attachments: testAtt,
    });
    brokenUntil = 0;
    return r;
  }

  const cfg = await settings.getSmtpConfig();
  const transporter = buildTransporter(cfg);
  if (!transporter) {
    const err = new Error("Aucun canal d'envoi n'est configuré (ni Microsoft Graph, ni SMTP).");
    err.code = 'NO_SMTP';
    throw err;
  }
  const html = renderMailTemplate({
    title: 'Test de configuration email',
    bodyHtml: '<p>Cet email confirme que la configuration SMTP de <strong>CCG Flow</strong> est fonctionnelle. ✅</p><p>Vous pouvez fermer ce message.</p>',
  });
  const result = await transporter.sendMail({
    from: cfg.from,
    to,
    subject: 'CCG Flow — email de test',
    text: 'Cet email confirme que la configuration SMTP de CCG Flow est fonctionnelle.',
    html,
    attachments: [{ filename: 'logo-ccg.png', path: LOGO_PATH, cid: LOGO_CID }],
  });
  // Une config valide remet le coupe-circuit à zéro : les envois métier repartent immédiatement.
  brokenUntil = 0;
  return result;
}

module.exports = { sendMail, sendTestMail, renderMailTemplate };
