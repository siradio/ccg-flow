const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const { sendMail, renderMailTemplate } = require('../../utils/mailer');
const notify = require('./dsi.notify');

// Paramètres DSI. Notification e-mail à la réception d'un ticket : liste de destinataires
// configurable. Lecture au niveau consultation du module Tickets ; modification au niveau édition.
const router = express.Router();
router.use(requireAuth);
const canView = requireSubModule('dsi.tickets', 'consultation');
const canEdit = requireSubModule('dsi.tickets', 'edition');

router.get('/incident-notify', canView, async (req, res, next) => {
  try { res.json(await notify.getConfig()); } catch (e) { next(e); }
});

router.put('/incident-notify', canEdit, async (req, res, next) => {
  try {
    const b = req.body || {};
    res.json(await notify.setConfig({ actif: !!b.actif, emails: b.emails || '' }));
  } catch (e) { next(e); }
});

// Envoi d'un e-mail de test aux destinataires configurés (à défaut, à l'utilisateur connecté).
router.post('/incident-notify/test', canEdit, async (req, res, next) => {
  try {
    const { emails } = await notify.getConfig();
    const to = emails.length ? emails : [req.user.email].filter(Boolean);
    if (!to.length) return res.status(400).json({ error: 'Aucun destinataire (renseignez des e-mails ou ayez une adresse sur votre compte).' });
    await sendMail({
      to: to.join(','),
      subject: 'CCG Flow — Test de notification incident',
      html: renderMailTemplate({ title: 'Test de notification', bodyHtml: '<p>Ceci est un e-mail de test de la notification des tickets DSI. Si vous le recevez, la configuration est opérationnelle.</p>' }),
      text: 'Test de notification des tickets DSI. Configuration opérationnelle.',
    });
    res.json({ ok: true, to });
  } catch (e) { next(e); }
});

module.exports = router;
