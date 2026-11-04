const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { requireAuth } = require('../../middleware/auth');
const { loginLimiter } = require('../../middleware/rateLimiters');
const usersService = require('../users/users.service');

const router = express.Router();

// Hash factice : on compare TOUJOURS le mot de passe à un hash bcrypt, même quand l'email est
// inconnu, pour que le temps de réponse ne révèle pas l'existence d'un compte (anti-énumération).
const DUMMY_HASH = bcrypt.hashSync('invalid-password-placeholder', 10);

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }
    const user = await usersService.findByEmail(email);
    const passwordOk = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !user.actif || !passwordOk) {
      return res.status(401).json({ error: 'Identifiants incorrects ou compte désactivé.' });
    }
    // Un compte issu d'une demande d'accès non encore traitée ne peut pas se connecter.
    if (user.access_status === 'pending') {
      return res.status(403).json({ error: "Votre demande d'accès est en attente de validation par un administrateur." });
    }
    if (user.access_status === 'rejected') {
      return res.status(403).json({ error: "Votre demande d'accès a été refusée. Contactez un administrateur." });
    }
    // Session unique (« dernière connexion gagne ») : on génère une nouvelle session_id, on la
    // stocke, et on l'embarque dans le JWT. Toute session précédente (autre session_id) devient
    // invalide → l'ancien appareil est déconnecté à sa prochaine requête (middleware/auth.js).
    const sid = crypto.randomUUID();
    await usersService.setSessionId(user.id, sid);
    const full = await usersService.loadUserWithRoles(user.id);
    // Journalise la connexion pour les statistiques d'utilisation. Best-effort : une panne du
    // journal ne doit jamais empêcher un utilisateur de se connecter.
    usersService.recordLogin(full.id).catch(() => {});
    // Le token ne porte que l'identité + la session : rôles/modules/BU sont relus en base à chaque
    // requête (voir middleware/auth.js), pour qu'un changement de droits prenne effet immédiatement.
    const token = jwt.sign({ id: full.id, sid }, env.jwtSecret, { expiresIn: '8h' });
    res.json({ token, user: full });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const full = await usersService.loadUserWithRoles(req.user.id);
    if (!full) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json(full);
  } catch (e) { next(e); }
});

module.exports = router;
