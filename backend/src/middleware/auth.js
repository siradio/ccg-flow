const jwt = require('jsonwebtoken');
const env = require('../config/env');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = payload; // { id, nom, prenom, email, roles: [{ entity_id, entity_code, role_code }] }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
}

module.exports = { requireAuth, JWT_SECRET: env.jwtSecret };
