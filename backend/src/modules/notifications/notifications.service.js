const { all, one, run } = require('../../db');
const mailer = require('../../utils/mailer');
const env = require('../../config/env');

const escapeHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function notify(userId, type, message, lien) {
  await one(
    'INSERT INTO notifications (user_id, type, message, lien) VALUES ($1,$2,$3,$4) RETURNING id',
    [userId, type, message, lien || null]
  );
  const user = await one('SELECT email, nom, prenom FROM users WHERE id = $1', [userId]);
  // On n'envoie l'e-mail QUE si le compte a une adresse : un `to` vide fait échouer l'envoi et
  // déclenche le coupe-circuit du mailer (60 s), ce qui priverait d'e-mail les destinataires
  // suivants de la même cascade de validation (bug observé sur le workflow RH).
  if (!user || !user.email || !String(user.email).trim()) return;
  try {
    const url = env.appUrl && lien ? `${env.appUrl}${lien.startsWith('/') ? '' : '/'}${lien}` : null;
    const html = mailer.renderMailTemplate({
      title: type,
      bodyHtml: `<p>${escapeHtml(message)}</p>${url
        ? `<p style="margin-top:22px;"><a href="${url}" style="display:inline-block;background:#2454e0;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:bold;">Ouvrir dans CCG Flow</a></p>`
        : ''}`,
    });
    await mailer.sendMail({ to: user.email, subject: `[CCG Flow] ${type}`, text: message + (url ? `\n\n${url}` : ''), html });
  } catch (e) {
    console.error(`Échec envoi email de notification à ${user.email} :`, e.message);
  }
}

// Notifie tous les utilisateurs détenant role_code sur entity_id (utilisé par le workflow des demandes d'achat).
async function notifyRoleOnEntity(entityId, roleCode, type, message, lien) {
  // On ne notifie QUE les vrais titulaires du rôle demandé sur cette entité. Les super_admin ne
  // sont PAS inclus : bien qu'ils puissent agir partout, ils n'ont pas à recevoir chaque
  // notification de validation d'un rôle qu'ils n'exercent pas (ex. « valider le besoin »).
  const holders = await all(
    `SELECT DISTINCT u.id FROM users u
     JOIN user_entity_roles uer ON uer.user_id = u.id
     WHERE u.actif = true AND uer.role_code = $1 AND uer.entity_id = $2`,
    [roleCode, entityId]
  );
  for (const h of holders) {
    await notify(h.id, type, message, lien);
  }
}

async function listForUser(userId, unreadOnly) {
  if (unreadOnly) {
    return all('SELECT * FROM notifications WHERE user_id = $1 AND lu = false ORDER BY created_at DESC', [userId]);
  }
  return all('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
}

async function markRead(userId, notifId) {
  await run('UPDATE notifications SET lu = true WHERE id = $1 AND user_id = $2', [notifId, userId]);
}

module.exports = { notify, notifyRoleOnEntity, listForUser, markRead };
