const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const { sendTestMail } = require('../../utils/mailer');
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
// On utilise sendTestMail (hors coupe-circuit) et on remonte l'ERREUR RÉELLE d'envoi (SMTP/Graph)
// pour permettre le diagnostic, au lieu d'un « Erreur serveur » générique.
router.post('/incident-notify/test', canEdit, async (req, res, next) => {
  try {
    // On teste en priorité les adresses SAISIES (avant enregistrement) ; sinon celles déjà
    // enregistrées ; en dernier recours l'e-mail du compte. On écarte les domaines réservés
    // RFC 2606 (.test/.example/.invalid/.localhost, example.com…) que les relais SMTP rejettent.
    const parse = (s) => String(s || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
    const reserved = (e) => /(@|\.)(example\.(com|net|org)|test|example|invalid|localhost)$/i.test(e);
    const provided = parse(req.body && req.body.emails);
    const saved = (await notify.getConfig()).emails;
    let to = (provided.length ? provided : (saved.length ? saved : [req.user.email].filter(Boolean)));
    to = to.filter(e => !reserved(e));
    if (!to.length) return res.status(400).json({ error: 'Aucune adresse valide à tester (les adresses en @test / example.com sont refusées par le serveur d’envoi).' });
    try {
      await sendTestMail({ to: to.join(',') });
    } catch (mailErr) {
      return res.status(502).json({ error: `Échec de l'envoi : ${mailErr.message}` });
    }
    res.json({ ok: true, to });
  } catch (e) { next(e); }
});

module.exports = router;
