const crypto = require('crypto');
const { sendMail, renderMailTemplate } = require('../../utils/mailer');

// Mot de passe lisible mais solide (3 groupes de 4, ex. "Kf9p-Qr2s-Ab3d"), généré côté serveur
// quand l'admin ne saisit pas de mot de passe et demande une notification : on peut ainsi l'envoyer
// par email sans jamais recourir à un mot de passe par défaut connu de tous.
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // sans I/O/0/1/l ambigus
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (const b of bytes) s += chars[b % chars.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function esc(v) {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Envoie au nouvel utilisateur ses identifiants de connexion. Réutilise le gabarit HTML commun
// (logo + en-tête CCG) et fournit un repli texte pour la délivrabilité.
async function sendCredentialsEmail({ to, prenom, email, password, loginUrl }) {
  const link = loginUrl || '';
  const bodyHtml = `
    <p style="margin:0 0 14px;">Bonjour ${esc(prenom)},</p>
    <p style="margin:0 0 18px;">Un compte vient d'être créé pour vous sur <strong>CCG Flow</strong>, l'ERP du groupe CCG. Voici vos identifiants de connexion :</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; margin:0 0 22px; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
      <tr>
        <td style="padding:12px 16px; background:#f8fafc; color:#6b7280; font-size:13px; width:42%; border-bottom:1px solid #e5e7eb;">Adresse email</td>
        <td style="padding:12px 16px; color:#0f172a; font-size:14px; font-weight:bold; border-bottom:1px solid #e5e7eb;">${esc(email)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; background:#f8fafc; color:#6b7280; font-size:13px;">Mot de passe</td>
        <td style="padding:12px 16px; color:#0f172a; font-size:14px; font-weight:bold; font-family:'Courier New',monospace; letter-spacing:.5px;">${esc(password)}</td>
      </tr>
    </table>
    ${link ? `<p style="margin:0 0 22px;"><a href="${esc(link)}" style="display:inline-block; background:#1d4ed8; color:#ffffff; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 26px; border-radius:6px;">Se connecter à CCG Flow</a></p>` : ''}
    <p style="margin:0; color:#6b7280; font-size:13px; line-height:1.5;">Pour votre sécurité, conservez ces informations confidentielles et ne les partagez avec personne. En cas de question, rapprochez-vous de votre administrateur.</p>
  `;
  const text = [
    `Bonjour ${prenom},`,
    '',
    "Un compte vient d'être créé pour vous sur CCG Flow, l'ERP du groupe CCG.",
    'Voici vos identifiants de connexion :',
    '',
    `  Adresse email : ${email}`,
    `  Mot de passe  : ${password}`,
    '',
    link ? `Connexion : ${link}` : '',
    '',
    'Pour votre sécurité, conservez ces informations confidentielles.',
  ].filter(l => l !== undefined).join('\n');

  return sendMail({
    to,
    subject: 'Vos accès à CCG Flow',
    html: renderMailTemplate({ title: 'Bienvenue sur CCG Flow', bodyHtml }),
    text,
  });
}

// Notifie le demandeur que sa demande d'accès a été refusée, avec le motif saisi par l'admin.
async function sendAccessRejectedEmail({ to, prenom, note }) {
  const motif = (note || '').trim();
  const bodyHtml = `
    <p style="margin:0 0 14px;">Bonjour ${esc(prenom)},</p>
    <p style="margin:0 0 16px;">Votre demande d'accès à <strong>CCG Flow</strong> n'a pas pu être acceptée.</p>
    ${motif ? `<p style="margin:0 0 16px; padding:12px 16px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#7f1d1d;"><strong>Motif :</strong> ${esc(motif)}</p>` : ''}
    <p style="margin:0; color:#6b7280; font-size:13px;">Pour toute question, rapprochez-vous de votre administrateur.</p>
  `;
  const text = [
    `Bonjour ${prenom},`,
    '',
    "Votre demande d'accès à CCG Flow n'a pas pu être acceptée.",
    motif ? `Motif : ${motif}` : '',
    '',
    'Pour toute question, rapprochez-vous de votre administrateur.',
  ].filter(l => l !== '').join('\n');

  return sendMail({
    to,
    subject: "Votre demande d'accès à CCG Flow",
    html: renderMailTemplate({ title: "Demande d'accès refusée", bodyHtml }),
    text,
  });
}

module.exports = { generatePassword, sendCredentialsEmail, sendAccessRejectedEmail };
