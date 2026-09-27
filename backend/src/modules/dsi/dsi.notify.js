const settings = require('../settings/settings.service');
const env = require('../../config/env');
const { sendMail, renderMailTemplate } = require('../../utils/mailer');

// Notification e-mail à la réception d'un ticket (incident / demande). La liste des destinataires
// est configurable (Paramètres DSI). Best-effort : un échec d'envoi ne bloque jamais la création.
const K_ACTIF = 'dsi_incident_notify_actif';
const K_EMAILS = 'dsi_incident_notify_emails';
const EMPTY = '—'; // sentinelle « liste vide enregistrée » (comme l'alerte permis)

function parseEmails(raw) {
  if (!raw || raw === EMPTY) return [];
  return String(raw).split(/[;,]/).map(s => s.trim()).filter(Boolean);
}

async function getConfig() {
  const actif = String(await settings.getValue(K_ACTIF, 'false')) === 'true';
  const emails = parseEmails(await settings.getValue(K_EMAILS, ''));
  return { actif, emails };
}

async function setConfig({ actif, emails }) {
  await settings.setValue(K_ACTIF, actif ? 'true' : 'false');
  const list = Array.isArray(emails) ? emails : parseEmails(emails);
  await settings.setValue(K_EMAILS, list.length ? list.join(', ') : EMPTY);
  return getConfig();
}

const NATURE_LABEL = (n) => (n === 'demande' ? 'Demande' : 'Incident');

function buildMail(ticket) {
  const nat = NATURE_LABEL(ticket.nature);
  const link = env.appUrl ? `${env.appUrl}/dsi/tickets/${ticket.id}` : null;
  const rows = [
    ['Référence', ticket.reference],
    ['Nature', nat],
    ['Objet', ticket.objet],
    ['Priorité', ticket.priorite || '—'],
    ['Impact', ticket.impact || '—'],
    ['Demandeur', ticket.demandeur_nom || '—'],
    ['Entité', ticket.entity_code || '—'],
    ['Business Unit', ticket.business_unit_nom || '—'],
    ['Site', ticket.site_nom || '—'],
  ];
  const trs = rows.map(([k, v]) => `<tr><td style="padding:4px 10px;color:#6b7280">${k}</td><td style="padding:4px 10px;font-weight:600">${String(v ?? '—')}</td></tr>`).join('');
  const desc = ticket.description ? `<p style="margin:12px 0 0"><strong>Description :</strong><br>${String(ticket.description).replace(/\n/g, '<br>')}</p>` : '';
  const btn = link ? `<p style="margin:16px 0 0"><a href="${link}" style="background:#1d4ed8;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Ouvrir le ticket</a></p>` : '';
  const bodyHtml = `<p>Un nouveau ticket vient d'être enregistré dans CCG Flow :</p><table style="border-collapse:collapse;font-size:14px">${trs}</table>${desc}${btn}`;
  const text = `Nouveau ticket ${nat} — ${ticket.reference}\nObjet : ${ticket.objet}\nDemandeur : ${ticket.demandeur_nom || '—'}\nPriorité : ${ticket.priorite || '—'}\n${link ? 'Lien : ' + link : ''}`;
  return {
    subject: `CCG Flow — Nouveau ${nat.toLowerCase()} ${ticket.reference} : ${ticket.objet}`,
    html: renderMailTemplate({ title: `Nouveau ${nat.toLowerCase()} — ${ticket.reference}`, bodyHtml }),
    text,
  };
}

// Envoi de l'alerte pour un ticket nouvellement créé (best-effort).
async function notifyNewTicket(ticket) {
  try {
    const { actif, emails } = await getConfig();
    if (!actif || !emails.length) return;
    const { subject, html, text } = buildMail(ticket);
    await sendMail({ to: emails.join(','), subject, html, text });
  } catch (e) {
    // Ne jamais interrompre la création d'un ticket à cause d'un échec e-mail.
    console.error('[dsi.notify] échec notification incident:', e.message);
  }
}

module.exports = { getConfig, setConfig, notifyNewTicket, buildMail };
