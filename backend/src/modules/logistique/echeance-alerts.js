const { all } = require('../../db');
const settings = require('../settings/settings.service');
const { sendMail, renderMailTemplate } = require('../../utils/mailer');

// Alertes d'échéance des documents véhicule (assurance, visite technique…). Vérification quotidienne
// planifiée + envoi « maintenant » à la demande. Config stockée dans app_settings :
//   echeance_alert_actif  : 'true' | 'false'
//   echeance_alert_jours  : nb de jours avant échéance à couvrir (défaut 30)
//   echeance_alert_emails : destinataires séparés par virgule/point-virgule
//   echeance_alert_last_sent : garde anti-doublon (une seule alerte par jour, même après redémarrage)

function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmt(d) { return d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'; }

async function getConfig() {
  const actif = String(await settings.getValue('echeance_alert_actif', 'false')) === 'true';
  const jours = await settings.getIntValue('echeance_alert_jours', 30);
  const emails = String((await settings.getValue('echeance_alert_emails', '')) || '')
    .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  return { actif, jours, emails };
}

// Documents dont l'échéance tombe dans les `jours` prochains (ou déjà passée).
async function dueDocuments(jours) {
  return all(
    `SELECT d.type, d.numero, d.date_fin, v.immatriculation,
            (d.date_fin - CURRENT_DATE)::int AS jours_restants
     FROM vehicle_documents d JOIN vehicles v ON v.id = d.vehicle_id
     WHERE d.date_fin IS NOT NULL AND d.date_fin <= CURRENT_DATE + $1::int
     ORDER BY d.date_fin ASC`,
    [Number(jours) || 30]
  );
}

function buildEmail(rows) {
  const lignes = rows.map(r => {
    const jr = Number(r.jours_restants);
    const etat = jr < 0 ? `<span style="color:#c0392b;font-weight:bold">Expiré (${-jr} j)</span>`
      : jr <= 7 ? `<span style="color:#c0392b">${jr} j</span>`
        : `<span style="color:#b07714">${jr} j</span>`;
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(r.immatriculation)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(r.type)}${r.numero ? ` (${esc(r.numero)})` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${fmt(r.date_fin)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${etat}</td>
    </tr>`;
  }).join('');
  const bodyHtml = `
    <p style="margin:0 0 14px">Les documents véhicule suivants arrivent à échéance (ou sont déjà expirés) :</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <tr style="background:#f8fafc;color:#6b7280;font-size:13px;text-align:left">
        <th style="padding:8px 12px">Véhicule</th><th style="padding:8px 12px">Document</th><th style="padding:8px 12px">Échéance</th><th style="padding:8px 12px">Reste</th>
      </tr>
      ${lignes}
    </table>
    <p style="margin:18px 0 0;color:#6b7280;font-size:13px">Pensez à renouveler ces documents dans CCG Link → Logistique → Documents & échéances.</p>`;
  const text = 'Documents véhicule à renouveler :\n' + rows.map(r => `- ${r.immatriculation} · ${r.type}${r.numero ? ` (${r.numero})` : ''} · échéance ${fmt(r.date_fin)} (${r.jours_restants} j)`).join('\n');
  return { html: renderMailTemplate({ title: 'Échéances véhicule à renouveler', bodyHtml }), text };
}

// Envoi immédiat à des destinataires donnés (bouton « Envoyer maintenant »). Renvoie le nb d'items.
async function sendDigestTo(emails, jours) {
  const rows = await dueDocuments(jours);
  if (rows.length === 0) return { count: 0, sent: false };
  const { html, text } = buildEmail(rows);
  await sendMail({ to: emails.join(','), subject: `CCG Link — ${rows.length} document(s) véhicule à renouveler`, html, text });
  return { count: rows.length, sent: true };
}

// Passage quotidien : respecte l'activation et n'envoie qu'une fois par jour (garde last_sent).
async function runDaily(force = false) {
  const { actif, jours, emails } = await getConfig();
  if (!actif || emails.length === 0) return;
  if (!force) {
    const today = new Date().toISOString().slice(0, 10);
    const last = await settings.getValue('echeance_alert_last_sent', '');
    if (last === today) return; // déjà envoyé aujourd'hui
    await settings.setValue('echeance_alert_last_sent', today);
  }
  try { await sendDigestTo(emails, jours); } catch (e) { console.error('Alerte échéance : échec envoi —', e.message); }
}

let started = false;
function startEcheanceAlerts() {
  if (started) return; started = true;
  // Premier passage ~1 min après le démarrage, puis toutes les 24 h (single-instance).
  setTimeout(() => {
    runDaily().catch(() => {});
    setInterval(() => runDaily().catch(() => {}), 24 * 60 * 60 * 1000);
  }, 60 * 1000);
}

module.exports = { startEcheanceAlerts, runDaily, sendDigestTo, getConfig };
