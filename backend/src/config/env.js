// En test (npm test -> NODE_ENV=test), on charge .env.test : une base dédiée, distincte de
// celle du développement, pour que la suite e2e (qui fait un DROP SCHEMA CASCADE) ne puisse
// jamais effacer des données réelles par accident.
require('dotenv').config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

module.exports = {
  port: process.env.PORT || 4001,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-a-changer',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '"Achats CCG" <achats@ccg-guinee.com>',
  },
};
