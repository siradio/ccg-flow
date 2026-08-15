const { all, one, run } = require('../../db');
const mailer = require('../../utils/mailer');

async function notify(userId, type, message, lien) {
  await one(
    'INSERT INTO notifications (user_id, type, message, lien) VALUES ($1,$2,$3,$4) RETURNING id',
    [userId, type, message, lien || null]
  );
  const user = await one('SELECT email, nom, prenom FROM users WHERE id = $1', [userId]);
  if (user) {
    try {
      await mailer.sendMail({ to: user.email, subject: `[CCG Flow] ${type}`, text: message });
    } catch (e) {
      console.error(`Échec envoi email de notification à ${user.email} :`, e.message);
    }
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
