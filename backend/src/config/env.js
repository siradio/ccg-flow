// En test (npm test -> NODE_ENV=test), on charge .env.test : une base dédiée, distincte de
// celle du développement, pour que la suite e2e (qui fait un DROP SCHEMA CASCADE) ne puisse
// jamais effacer des données réelles par accident.
require('dotenv').config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

// URL publique de l'application, utilisée pour les liens dans les emails (ex. lien de connexion
// envoyé au nouvel utilisateur). Priorité : APP_URL explicite, sinon WEBSITE_HOSTNAME — qu'Azure
// App Service positionne automatiquement (ex. "ccgflow-prod-xxx.azurewebsites.net") — sinon vide,
// et on retombe alors sur l'hôte de la requête (correct en local, mais jamais "localhost" en prod
// Azure). Ne jamais dériver de req.get('host') seul : derrière un proxy ça peut donner localhost.
const appUrl = (process.env.APP_URL
  || (process.env.WEBSITE_HOSTNAME ? `https://${process.env.WEBSITE_HOSTNAME}` : '')
).replace(/\/+$/, '');

// Secret de signature des JWT — OBLIGATOIRE, aucun fallback en dur (un secret commité au dépôt
// permettrait de forger des jetons et d'usurper n'importe quel compte). On échoue au démarrage s'il
// est absent, et on exige une longueur suffisante en production. En dev/test, on se contente d'un
// avertissement pour ne pas bloquer un secret court (ex. base de test de la CI).
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET est obligatoire : définissez-le dans l\'environnement (32+ octets aléatoires). Aucun secret par défaut n\'est utilisé.');
}
if (jwtSecret.length < 32) {
  const msg = '[sécurité] JWT_SECRET fait moins de 32 caractères — utilisez un secret aléatoire de 32 octets ou plus.';
  if (process.env.NODE_ENV === 'production') throw new Error(msg);
  console.warn(msg);
}

module.exports = {
  port: process.env.PORT || 4001,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret,
  appUrl,
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '"Achats CCG" <achats@ccg-guinee.com>',
  },
  // Envoi via Microsoft Graph (OAuth2 app-only, permission Mail.Send) — voie moderne recommandée par
  // Microsoft depuis la fin du Basic Auth SMTP. Prioritaire sur SMTP dès que ces 4 valeurs sont
  // renseignées. `sender` = boîte aux lettres d'envoi (UPN, ex. direction@ccggroupe.com) ; le nom
  // d'affichage optionnel de l'expéditeur peut être posé via GRAPH_FROM_NAME.
  graph: {
    tenantId: process.env.GRAPH_TENANT_ID || '',
    clientId: process.env.GRAPH_CLIENT_ID || '',
    clientSecret: process.env.GRAPH_CLIENT_SECRET || '',
    sender: process.env.GRAPH_SENDER || process.env.SMTP_USER || '',
    fromName: process.env.GRAPH_FROM_NAME || 'CCG Flow',
  },
};
