const fs = require('fs');
const env = require('../config/env');

// Envoi d'emails via Microsoft Graph (OAuth2 app-only, permission applicative Mail.Send).
// Alternative au SMTP Basic Auth, que Microsoft a retiré : aucune authentification par mot de passe,
// on obtient un jeton via client_credentials puis on appelle POST /users/{sender}/sendMail.
// Aucune dépendance : on utilise fetch (Node 18+, présent sur l'App Service Azure).

const TOKEN_URL = t => `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`;
const SENDMAIL_URL = s => `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(s)}/sendMail`;

function isGraphConfigured() {
  const g = env.graph;
  return !!(g && g.tenantId && g.clientId && g.clientSecret && g.sender);
}

// Cache du jeton d'accès : Graph le délivre pour ~1h, inutile d'en redemander un à chaque email.
let cachedToken = { value: null, expiresAt: 0 };

async function getToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;
  const g = env.graph;
  const body = new URLSearchParams({
    client_id: g.clientId,
    client_secret: g.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(TOKEN_URL(g.tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Graph: échec d'obtention du jeton (${String(msg).split('\n')[0]})`);
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

// Convertit une pièce jointe façon nodemailer ({ filename, path|content, cid, contentType }) en
// fileAttachment Graph (contenu en base64). `cid` => pièce inline (logo intégré au gabarit HTML).
function toGraphAttachment(a) {
  let bytes;
  if (a.content != null) bytes = (Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content)).toString('base64');
  else if (a.path) bytes = fs.readFileSync(a.path).toString('base64');
  else return null;
  const att = {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: a.filename || 'piece-jointe',
    contentBytes: bytes,
    isInline: !!a.cid,
  };
  if (a.contentType) att.contentType = a.contentType;
  if (a.cid) att.contentId = a.cid;
  return att;
}

function toRecipients(to) {
  return String(to || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(address => ({ emailAddress: { address } }));
}

// Envoie un email via Graph. Signature alignée sur sendMail (utils/mailer.js).
async function sendViaGraph({ to, subject, text, html, attachments }) {
  const token = await getToken();
  const g = env.graph;
  const message = {
    subject: subject || '',
    body: html ? { contentType: 'HTML', content: html } : { contentType: 'Text', content: text || '' },
    toRecipients: toRecipients(to),
  };
  if (g.fromName) message.from = { emailAddress: { address: g.sender, name: g.fromName } };
  const graphAtt = (attachments || []).map(toGraphAttachment).filter(Boolean);
  if (graphAtt.length) message.attachments = graphAtt;

  const res = await fetch(SENDMAIL_URL(g.sender), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: false }),
  });
  if (res.status === 202) return { graph: true, to };
  const data = await res.json().catch(() => ({}));
  const msg = (data.error && (data.error.message || data.error.code)) || `HTTP ${res.status}`;
  throw new Error(`Graph: envoi refusé (${String(msg).split('\n')[0]})`);
}

module.exports = { isGraphConfigured, sendViaGraph, sender: () => env.graph.sender };
