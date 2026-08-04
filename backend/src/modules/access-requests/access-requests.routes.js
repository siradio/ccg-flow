const express = require('express');
const { all, one } = require('../../db');
const usersService = require('../users/users.service');
const { generatePassword } = require('../users/users.email');

// Routes PUBLIQUES (sans authentification) : formulaire de demande d'accès depuis la page de
// connexion. Une demande crée un compte au statut "pending" (à valider par l'admin / IT).
const router = express.Router();

// Liste des entités pour peupler le champ "Entité" du formulaire (public, lecture seule).
router.get('/entities', async (req, res, next) => {
  try { res.json(await all('SELECT id, code, nom FROM entities ORDER BY nom')); }
  catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { nom, prenom, email, telephone, fonction, entityId } = req.body || {};
    if (!nom || !prenom || !email || !entityId) {
      return res.status(400).json({ error: 'Nom, prénom, email et entité sont obligatoires.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }
    const existing = await usersService.findByEmail(String(email).trim());
    if (existing) {
      return res.status(409).json({ error: 'Un compte (ou une demande) existe déjà avec cet email.' });
    }
    const entity = await one('SELECT id FROM entities WHERE id = $1', [Number(entityId)]);
    if (!entity) return res.status(400).json({ error: 'Entité inconnue.' });

    await usersService.createPendingUser({
      nom: String(nom).trim(),
      prenom: String(prenom).trim(),
      email: String(email).trim(),
      telephone: telephone ? String(telephone).trim() : null,
      fonction: fonction ? String(fonction).trim() : null,
      entityId: entity.id,
      password: generatePassword(), // aléatoire : inutilisable jusqu'à validation + envoi d'identifiants
    });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
