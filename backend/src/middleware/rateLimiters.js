const rateLimit = require('express-rate-limit');

// Protection anti-force-brute / anti-abus. Les clés reposent sur req.ip, qui n'est fiable que si
// `app.set('trust proxy', 1)` est configuré (cf. server.js) — sinon toutes les requêtes derrière le
// proxy Azure partageraient la même IP.
//
// En environnement de test (e2e), on désactive les limiteurs : la suite enchaîne de nombreuses
// requêtes depuis une seule IP et déclencherait le plafond (faux échecs). C'est la logique métier
// qui est testée, pas le rate-limiting.
const DISABLED = process.env.NODE_ENV === 'test';
const passthrough = (req, res, next) => next();

// Connexion : fenêtre glissante, quelques essais seulement. On ne compte PAS les connexions réussies
// (skipSuccessfulRequests) pour ne pas pénaliser un utilisateur légitime très actif.
const loginLimiter = DISABLED ? passthrough : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' },
});

// Écritures publiques non authentifiées (ex. demande d'accès) : plafond bas par IP.
const publicWriteLimiter = DISABLED ? passthrough : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez plus tard.' },
});

module.exports = { loginLimiter, publicWriteLimiter };
