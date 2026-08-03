const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSuperAdmin } = require('../../middleware/permissions');
const service = require('./settings.service');
const { sendTestMail } = require('../../utils/mailer');

const router = express.Router();

// Lecture ouverte à tout utilisateur authentifié : le frontend a besoin de connaître, par
// exemple, le nombre minimum de fournisseurs à consulter avant même d'être admin.
// NB : les clés SMTP sont exclues de cette réponse (voir settings.service.getAll) car sensibles.
router.get('/', requireAuth, async (req, res, next) => {
  try { res.json(await service.getAll()); }
  catch (e) { next(e); }
});

// --- Configuration SMTP (super_admin uniquement) ---
// Le mot de passe n'est jamais renvoyé : seul un indicateur `passwordSet` est exposé.
router.get('/smtp', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try { res.json(await service.getSmtpConfigForAdmin()); }
  catch (e) { next(e); }
});

router.put('/smtp', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { host, port, user, from, secure, password } = req.body || {};
    if (port !== undefined && port !== '' && !Number.isFinite(Number(port))) {
      return res.status(400).json({ error: 'Le port doit être un nombre.' });
    }
    // password : champ optionnel. Absent => mot de passe inchangé. Chaîne vide => effacement.
    res.json(await service.setSmtpConfig({ host, port, user, from, secure, password }));
  } catch (e) { next(e); }
});

// Envoie un vrai email de test avec la config actuellement enregistrée. `to` par défaut = l'email
// du super_admin connecté. Renvoie l'erreur SMTP lisible en cas d'échec (identifiants, hôte...).
router.post('/smtp/test', requireAuth, requireSuperAdmin, async (req, res, next) => {
  const to = (req.body && req.body.to) || req.user.email;
  if (!to) return res.status(400).json({ error: 'Adresse destinataire manquante.' });
  try {
    await sendTestMail({ to });
    res.json({ ok: true, to });
  } catch (e) {
    res.status(502).json({ ok: false, error: e && e.message ? e.message : 'Échec de l’envoi.' });
  }
});

router.put('/:key', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { value } = req.body || {};
    if (value === undefined || value === null || value === '') {
      return res.status(400).json({ error: 'value requis.' });
    }
    res.json({ key: req.params.key, value: await service.setValue(req.params.key, value) });
  } catch (e) { next(e); }
});

module.exports = router;
