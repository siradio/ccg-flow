const jwt = require('jsonwebtoken');
const env = require('../config/env');
const usersService = require('../modules/users/users.service');

// Le token ne sert qu'à authentifier l'identité (id) ; les droits (rôles, modules, BU) sont
// relus en base à chaque requête, pour qu'un octroi/retrait d'accès par un super_admin prenne
// effet immédiatement, sans attendre que l'utilisateur concerné se reconnecte.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const full = await usersService.loadUserWithRoles(payload.id);
    if (!full || !full.actif) {
      return res.status(401).json({ error: 'Compte introuvable ou désactivé.' });
    }
    req.user = {
      id: full.id,
      nom: full.nom,
      prenom: full.prenom,
      email: full.email,
      roles: full.roles.map(r => ({ entity_id: r.entity_id, entity_code: r.entity_code, role_code: r.role_code })),
      modules: full.modules,
      businessUnits: full.businessUnits,
      prixNiveau: full.prixNiveau,
    };
    next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session invalide ou expirée.' });
    }
    next(e);
  }
}

module.exports = { requireAuth, JWT_SECRET: env.jwtSecret };
