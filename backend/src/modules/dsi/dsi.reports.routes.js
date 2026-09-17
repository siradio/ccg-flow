const express = require('express');
const { all } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const svc = require('./dsi.reports.service');
const { generateReportPdf } = require('./dsi.reports.pdf');
const { generateReportWord } = require('./dsi.reports.word');
const branding = require('../referentials/entity-branding.service');

const router = express.Router();
router.use(requireAuth);
const canView = requireSubModule('dsi.rapports', 'consultation');
const canEdit = requireSubModule('dsi.rapports', 'edition');

router.get('/users', canView, async (req, res, next) => {
  try { res.json(await all(`SELECT id, TRIM(CONCAT(prenom,' ',nom)) AS nom FROM users WHERE actif=true ORDER BY nom, prenom`)); } catch (e) { next(e); }
});

router.get('/', canView, async (req, res, next) => {
  try { res.json(await svc.list()); } catch (e) { next(e); }
});

router.post('/generate', canEdit, async (req, res, next) => {
  try {
    const { annee, mois, entity_id } = req.body || {};
    res.status(201).json(await svc.generate(req.user, { annee: Number(annee), mois: Number(mois), entityId: entity_id ? Number(entity_id) : null }));
  } catch (e) { next(e); }
});

router.get('/:id', canView, async (req, res, next) => {
  try { const r = await svc.getById(Number(req.params.id)); if (!r) return res.status(404).json({ error: 'Rapport introuvable.' }); res.json(r); } catch (e) { next(e); }
});

router.get('/:id/pdf', canView, async (req, res, next) => {
  try {
    const r = await svc.getById(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Rapport introuvable.' });
    let logo = null;
    if (r.entity_id) { try { logo = (await branding.getEntityImages(r.entity_id)).logo; } catch { /* logo par défaut */ } }
    const buf = await generateReportPdf({ report: r, entityNom: r.entity_code ? r.entity_code : null, logoBuffer: logo });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Rapport-DSI-${r.annee}-${String(r.mois).padStart(2, '0')}.pdf"`);
    res.send(buf);
  } catch (e) { next(e); }
});

router.get('/:id/word', canView, async (req, res, next) => {
  try {
    const r = await svc.getById(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Rapport introuvable.' });
    const html = generateReportWord(r, r.entity_code || null);
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="Rapport-DSI-${r.annee}-${String(r.mois).padStart(2, '0')}.doc"`);
    res.send(html);
  } catch (e) { next(e); }
});

router.put('/:id', canEdit, async (req, res, next) => {
  try { res.json(await svc.updateSections(req.user, Number(req.params.id), req.body?.sections || {})); } catch (e) { next(e); }
});
router.post('/:id/submit', canEdit, async (req, res, next) => {
  try { res.json(await svc.setStatut(req.user, Number(req.params.id), 'a_valider')); } catch (e) { next(e); }
});
router.post('/:id/validate', canEdit, async (req, res, next) => {
  try { res.json(await svc.setStatut(req.user, Number(req.params.id), 'valide')); } catch (e) { next(e); }
});
router.post('/:id/diffuse', canEdit, async (req, res, next) => {
  try { res.json(await svc.setStatut(req.user, Number(req.params.id), 'diffuse')); } catch (e) { next(e); }
});
router.post('/:id/reopen', canEdit, async (req, res, next) => {
  try { res.json(await svc.setStatut(req.user, Number(req.params.id), 'brouillon')); } catch (e) { next(e); }
});
router.post('/:id/actions', canEdit, async (req, res, next) => {
  try { res.status(201).json(await svc.addAction(req.user, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
router.delete('/actions/:actionId', canEdit, async (req, res, next) => {
  try { await svc.deleteAction(req.user, Number(req.params.actionId)); res.json({ ok: true }); } catch (e) { next(e); }
});

module.exports = router;
