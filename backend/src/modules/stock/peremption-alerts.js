const { all } = require('../../db');
const settings = require('../settings/settings.service');
const { sendMail, renderMailTemplate } = require('../../utils/mailer');

// Refonte Stock (Lot 2) — Alertes de péremption des lots par email. Vérification quotidienne
// planifiée + envoi « maintenant » à la demande. Config dans app_settings :
//   peremption_alert_actif  : 'true' | 'false'
//   peremption_alert_jours  : nb de jours avant péremption à couvrir (défaut 30)
//   peremption_alert_emails : destinataires séparés par virgule/point-virgule
//   peremption_alert_last_sent : garde anti-doublon (une alerte par jour)

function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmt(d) { return d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'; }

async function getConfig() {
  const actif = String(await settings.getValue('peremption_alert_actif', 'false')) === 'true';
  const jours = await settings.getIntValue('peremption_alert_jours', 30);
  const emails = String((await settings.getValue('peremption_alert_emails', '')) || '')
    .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  return { actif, jours, emails };
}

// Lots dont la péremption tombe dans les `jours` prochains (ou déjà passée), avec stock restant.
async function expiringLots(jours) {
  return all(
    `SELECT l.numero_lot, l.date_peremption, p.code AS product_code, p.designation, bu.nom AS bu_nom,
            (l.date_peremption - CURRENT_DATE)::int AS jours_restants,
            COALESCE(b.quantite_restante, 0) AS quantite_restante
     FROM stock_lots l
     JOIN products p ON p.id = l.product_id
     LEFT JOIN business_units bu ON bu.id = p.business_unit_id
     LEFT JOIN v_stock_lot_balances b ON b.lot_id = l.id
     WHERE l.date_peremption IS NOT NULL AND l.date_peremption <= CURRENT_DATE + $1::int
       AND COALESCE(b.quantite_restante, 0) > 0
     ORDER BY l.date_peremption ASC`,
    [Number(jours) || 30]);
}

function buildEmail(rows) {
  const lignes = rows.map(r => {
    const jr = Number(r.jours_restants);
    const etat = jr < 0 ? `<span style="color:#c0392b;font-weight:bold">Périmé (${-jr} j)</span>`
      : jr <= 7 ? `<span style="color:#c0392b">${jr} j</span>`
        : `<span style="color:#b07714">${jr} j</span>`;
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(r.product_code || '')} ${esc(r.designation)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(r.numero_lot)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(r.bu_nom || '')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${fmt(r.date_peremption)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${Number(r.quantite_restante)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${etat}</td>
    </tr>`;
  }).join('');
  const bodyHtml = `
    <p style="margin:0 0 14px">Les lots suivants arrivent à péremption (ou sont déjà périmés) et ont encore du stock :</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <tr style="background:#f8fafc;color:#6b7280;font-size:13px;text-align:left">
        <th style="padding:8px 12px">Produit</th><th style="padding:8px 12px">Lot</th><th style="padding:8px 12px">BU</th><th style="padding:8px 12px">Péremption</th><th style="padding:8px 12px">Reste</th><th style="padding:8px 12px">Délai</th>
      </tr>${lignes}
    </table>
    <p style="margin:18px 0 0;color:#6b7280;font-size:13px">Écoulez ces lots en priorité (FEFO) — CCG Link → Stock → Lots.</p>`;
  const text = 'Lots proches de la péremption :\n' + rows.map(r => `- ${r.product_code} ${r.designation} · lot ${r.numero_lot} · ${fmt(r.date_peremption)} (${r.jours_restants} j) · reste ${r.quantite_restante}`).join('\n');
  return { html: renderMailTemplate({ title: 'Lots proches de la péremption', bodyHtml }), text };
}

async function sendDigestTo(emails, jours) {
  const rows = await expiringLots(jours);
  if (rows.length === 0) return { count: 0, sent: false };
  const { html, text } = buildEmail(rows);
  await sendMail({ to: emails.join(','), subject: `CCG Link — ${rows.length} lot(s) proche(s) de la péremption`, html, text });
  return { count: rows.length, sent: true };
}

async function runDaily(force = false) {
  const { actif, jours, emails } = await getConfig();
  if (!actif || emails.length === 0) return;
  if (!force) {
    const today = new Date().toISOString().slice(0, 10);
    const last = await settings.getValue('peremption_alert_last_sent', '');
    if (last === today) return;
    await settings.setValue('peremption_alert_last_sent', today);
  }
  try { await sendDigestTo(emails, jours); } catch (e) { console.error('Alerte péremption : échec envoi —', e.message); }
}

let started = false;
function startPeremptionAlerts() {
  if (started) return; started = true;
  setTimeout(() => {
    runDaily().catch(() => {});
    setInterval(() => runDaily().catch(() => {}), 24 * 60 * 60 * 1000);
  }, 60 * 1000);
}

module.exports = { startPeremptionAlerts, runDaily, sendDigestTo, getConfig, expiringLots };
