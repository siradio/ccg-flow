const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { requireAuth } = require('../../middleware/auth');
const usersService = require('../users/users.service');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }
    const user = await usersService.findByEmail(email);
    if (!user || !user.actif || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Identifiants incorrects ou compte désactivé.' });
    }
    const full = await usersService.loadUserWithRoles(user.id);
    // Le token ne porte que l'identité : rôles/modules/BU sont relus en base à chaque requête
    // (voir middleware/auth.js), pour qu'un changement de droits prenne effet immédiatement.
    const token = jwt.sign({ id: full.id }, env.jwtSecret, { expiresIn: '8h' });
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
