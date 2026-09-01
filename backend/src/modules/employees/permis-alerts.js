const { all } = require('../../db');
const settings = require('../settings/settings.service');
const { sendMail, renderMailTemplate } = require('../../utils/mailer');

// Alertes d'expiration du permis de travail des employés. Vérification quotidienne planifiée + envoi
// « maintenant » à la demande. Même mécanisme que les échéances véhicule (echeance-alerts.js).
// Config dans app_settings :
//   permis_alert_actif     : 'true' | 'false'
//   permis_alert_jours     : nb de jours avant expiration à couvrir (défaut 30)
//   permis_alert_emails    : destinataires séparés par virgule/point-virgule
//   permis_alert_last_sent : garde anti-doublon (une seule alerte par jour, même après redémarrage)

function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmt(d) { return d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'; }

async function getConfig() {
  const actif = String(await settings.getValue('permis_alert_actif', 'false')) === 'true';
  const jours = await settings.getIntValue('permis_alert_jours', 30);
  const emails = String((await settings.getValue('permis_alert_emails', '')) || '')
    .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  return { actif, jours, emails };
}

// Employés actifs dont le permis de travail expire dans les `jours` prochains (ou déjà expiré).
async function duePermits(jours) {
  return all(
    `SELECT e.matricule, e.prenom, e.nom, ent.code AS entity_code,
            e.permis_travail_expiration AS date_fin,
            (e.permis_travail_expiration - CURRENT_DATE)::int AS jours_restants
     FROM employees e
     LEFT JOIN entities ent ON ent.id = e.entity_id
     WHERE e.permis_travail = true AND e.statut = 'actif'
       AND e.permis_travail_expiration IS NOT NULL
       AND e.permis_travail_expiration <= CURRENT_DATE + $1::int
     ORDER BY e.permis_travail_expiration ASC`,
    [Number(jours) || 30]
  );
}

function buildEmail(rows) {
  const lignes = rows.map(r => {
    const jr = Number(r.jours_restants);
    const etat = jr < 0 ? `<span style="color:#c0392b;font-weight:bold">Expiré (${-jr} j)</span>`
      : jr <= 7 ? `<span style="color:#c0392b">${jr} j</span>`
        : `<span style="color:#b07714">${jr} j</span>`;
    const nom = `${esc(r.prenom || '')} ${esc(r.nom || '')}`.trim();
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${nom}${r.matricule ? ` (${esc(r.matricule)})` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(r.entity_code || '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${fmt(r.date_fin)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${etat}</td>
    </tr>`;
  }).join('');
  const bodyHtml = `
    <p style="margin:0 0 14px">Les permis de travail suivants arrivent à expiration (ou sont déjà expirés) :</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <tr style="background:#f8fafc;color:#6b7280;font-size:13px;text-align:left">
        <th style="padding:8px 12px">Employé</th><th style="padding:8px 12px">Entité</th><th style="padding:8px 12px">Expiration</th><th style="padding:8px 12px">Reste</th>
      </tr>
      ${lignes}
    </table>
    <p style="margin:18px 0 0;color:#6b7280;font-size:13px">Pensez à renouveler ces permis dans CCG Flow → Référentiels → Employés.</p>`;
  const text = 'Permis de travail à renouveler :\n' + rows.map(r => `- ${`${r.prenom || ''} ${r.nom || ''}`.trim()}${r.matricule ? ` (${r.matricule})` : ''} · ${r.entity_code || '—'} · expiration ${fmt(r.date_fin)} (${r.jours_restants} j)`).join('\n');
  return { html: renderMailTemplate({ title: 'Permis de travail à renouveler', bodyHtml }), text };
}

// Envoi immédiat à des destinataires donnés (bouton « Envoyer maintenant »). Renvoie le nb d'items.
async function sendDigestTo(emails, jours) {
  const rows = await duePermits(jours);
  if (rows.length === 0) return { count: 0, sent: false };
  const { html, text } = buildEmail(rows);
  await sendMail({ to: emails.join(','), subject: `CCG Flow — ${rows.length} permis de travail à renouveler`, html, text });
  return { count: rows.length, sent: true };
}

// Passage quotidien : respecte l'activation et n'envoie qu'une fois par jour (garde last_sent).
async function runDaily(force = false) {
  const { actif, jours, emails } = await getConfig();
  if (!actif || emails.length === 0) return;
  if (!force) {
    const today = new Date().toISOString().slice(0, 10);
    const last = await settings.getValue('permis_alert_last_sent', '');
    if (last === today) return; // déjà envoyé aujourd'hui
    await settings.setValue('permis_alert_last_sent', today);
  }
  try { await sendDigestTo(emails, jours); } catch (e) { console.error('Alerte permis de travail : échec envoi —', e.message); }
}

let started = false;
function startPermisAlerts() {
  if (started) return; started = true;
  // Premier passage ~1 min après le démarrage, puis toutes les 24 h (single-instance).
  setTimeout(() => {
    runDaily().catch(() => {});
    setInterval(() => runDaily().catch(() => {}), 24 * 60 * 60 * 1000);
  }, 60 * 1000);
}

module.exports = { startPermisAlerts, runDaily, sendDigestTo, getConfig };
