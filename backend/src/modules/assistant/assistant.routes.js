const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSuperAdmin } = require('../../middleware/permissions');
const service = require('./assistant.service');

// Assistant « CCG Flow » — compagnon à base de règles (sans IA).
//  • Lecture (personnage, nouveautés, FAQ) : ouverte à tout utilisateur authentifié — le widget
//    flottant est visible par tous, sans octroi de sous-module (comme l'onglet Outils).
//  • Administration (personnage, CRUD nouveautés & FAQ) : réservée au super_admin, sous /admin.
const router = express.Router();
router.use(requireAuth);

// ─── Lecture (tout utilisateur authentifié) ─────────────────────────────────────────────────────
router.get('/persona', async (req, res, next) => {
  try { res.json(await service.getPersona()); } catch (e) { next(e); }
});

router.get('/news', async (req, res, next) => {
  try { res.json(await service.listNews()); } catch (e) { next(e); }
});

router.get('/faq/suggestions', async (req, res, next) => {
  try { res.json(await service.faqSuggestions(6)); } catch (e) { next(e); }
});

router.get('/faq/search', async (req, res, next) => {
  try { res.json(await service.searchFaq(String(req.query.q || ''), 3)); } catch (e) { next(e); }
});

// ─── Administration (super_admin) ───────────────────────────────────────────────────────────────
const admin = express.Router();
admin.use(requireSuperAdmin);

admin.get('/persona', async (req, res, next) => {
  try { res.json(await service.getPersona()); } catch (e) { next(e); }
});
admin.put('/persona', async (req, res, next) => {
  try {
    const { enabled, name, gender, avatar, greeting } = req.body || {};
    res.json(await service.setPersona({ enabled, name, gender, avatar, greeting }));
  } catch (e) { next(e); }
});

admin.get('/news', async (req, res, next) => {
  try { res.json(await service.adminListNews()); } catch (e) { next(e); }
});
admin.post('/news', async (req, res, next) => {
  try {
    if (!String(req.body.titre || '').trim()) return res.status(400).json({ error: 'Le titre est obligatoire.' });
    res.status(201).json(await service.createNews(req.body || {}));
  } catch (e) { next(e); }
});
admin.put('/news/:id', async (req, res, next) => {
  try {
    const row = await service.updateNews(Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Annonce introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});
admin.delete('/news/:id', async (req, res, next) => {
  try { await service.removeNews(Number(req.params.id)); res.json({ ok: true }); } catch (e) { next(e); }
});

admin.get('/faq', async (req, res, next) => {
  try { res.json(await service.adminListFaq()); } catch (e) { next(e); }
});
admin.post('/faq', async (req, res, next) => {
  try {
    if (!String(req.body.question || '').trim()) return res.status(400).json({ error: 'La question est obligatoire.' });
    res.status(201).json(await service.createFaq(req.body || {}));
  } catch (e) { next(e); }
});
admin.put('/faq/:id', async (req, res, next) => {
  try {
    const row = await service.updateFaq(Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Entrée FAQ introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});
admin.delete('/faq/:id', async (req, res, next) => {
  try { await service.removeFaq(Number(req.params.id)); res.json({ ok: true }); } catch (e) { next(e); }
});

router.use('/admin', admin);

module.exports = router;
