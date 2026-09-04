const express = require('express');
const multer = require('multer');
const { all } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { isSuperAdmin, hasRoleOnEntity } = require('../../middleware/permissions');
const blob = require('../../storage/blob');
const service = require('./rh.service');
const repo = require('./rh.repository');

const router = express.Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const ALLOWED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']);
const CHAIN = ['responsable', 'rh'];

function canView(user, req) {
  if (req.created_by === user.id || isSuperAdmin(user)) return true;
  return (user.roles || []).some(r => (r.role_code === 'rh' || CHAIN.includes(r.role_code)) && Number(r.entity_id) === Number(req.entity_id));
}

// Types RH (congés / motifs d'absence / recrutement) — pour les formulaires.
router.get('/types', async (req, res, next) => {
  try {
    const domaine = req.query.domaine;
    const rows = domaine
      ? await all('SELECT * FROM rh_types WHERE actif = true AND domaine = $1 ORDER BY ordre, libelle', [domaine])
      : await all('SELECT * FROM rh_types WHERE actif = true ORDER BY domaine, ordre, libelle');
    res.json(rows);
  } catch (e) { next(e); }
});

// Jours ouvrables entre deux dates (calcul en direct côté formulaire).
router.get('/working-days', async (req, res, next) => {
  try { res.json({ jours: await service.workingDays(req.query.from, req.query.to) }); }
  catch (e) { next(e); }
});

// Listes : mine (mes demandes), pending (à valider), all (RH).
router.get('/requests', async (req, res, next) => {
  try {
    const scope = req.query.scope || 'mine';
    if (scope === 'pending') return res.json(await service.listPending(req.user));
    if (scope === 'all') {
      if (!service.canSeeAll(req.user)) return res.status(403).json({ error: 'Accès réservé au RH.' });
      return res.json(await service.listAll(req.user));
    }
    res.json(await service.listMine(req.user));
  } catch (e) { next(e); }
});

router.post('/requests/absence', async (req, res, next) => {
  try { res.status(201).json(await service.createAbsence(req.user, req.body || {})); }
  catch (e) { next(e); }
});

router.get('/requests/:id', async (req, res, next) => {
  try {
    const detail = await service.getDetail(Number(req.params.id));
    if (!detail) return res.status(404).json({ error: 'Demande introuvable.' });
    if (!canView(req.user, detail)) return res.status(403).json({ error: 'Accès refusé.' });
    res.json(detail);
  } catch (e) { next(e); }
});

router.post('/requests/:id/submit', async (req, res, next) => {
  try { res.json(await service.submit(req.user, Number(req.params.id))); } catch (e) { next(e); }
});
router.post('/requests/:id/validate', async (req, res, next) => {
  try { res.json(await service.validate(req.user, Number(req.params.id), (req.body || {}).comment)); } catch (e) { next(e); }
});
router.post('/requests/:id/reject', async (req, res, next) => {
  try { res.json(await service.reject(req.user, Number(req.params.id), (req.body || {}).comment)); } catch (e) { next(e); }
});
router.post('/requests/:id/cancel', async (req, res, next) => {
  try { res.json(await service.cancel(req.user, Number(req.params.id), (req.body || {}).comment)); } catch (e) { next(e); }
});

// Pièces jointes (justificatifs).
router.post('/requests/:id/attachments', upload.single('file'), async (req, res, next) => {
  try {
    const reqRow = await repo.getById(Number(req.params.id));
    if (!reqRow) return res.status(404).json({ error: 'Demande introuvable.' });
    if (!canView(req.user, reqRow)) return res.status(403).json({ error: 'Accès refusé.' });
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    if (!ALLOWED.has(req.file.mimetype)) return res.status(400).json({ error: 'Formats acceptés : PDF, PNG, JPEG.' });
    const key = await blob.putBuffer(req.file.buffer, req.file.mimetype, 'rh');
    const att = await repo.addAttachment({
      rhRequestId: reqRow.id, filename: req.file.originalname, mime: req.file.mimetype,
      taille: req.file.size, content: key ? null : req.file.buffer, contentKey: key, uploadedBy: req.user.id,
    });
    await repo.logHistory(reqRow.id, 'piece_jointe', req.user.id, req.file.originalname);
    res.status(201).json(att);
  } catch (e) { next(e); }
});

router.get('/attachments/:attId', async (req, res, next) => {
  try {
    const att = await repo.getAttachment(Number(req.params.attId));
    if (!att) return res.status(404).json({ error: 'Pièce jointe introuvable.' });
    const reqRow = await repo.getById(att.rh_request_id);
    if (!reqRow || !canView(req.user, reqRow)) return res.status(403).json({ error: 'Accès refusé.' });
    const buf = att.content_key ? await blob.getBuffer(att.content_key) : att.content;
    res.setHeader('Content-Type', att.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.filename)}"`);
    res.send(buf);
  } catch (e) { next(e); }
});

router.delete('/attachments/:attId', async (req, res, next) => {
  try {
    const att = await repo.getAttachment(Number(req.params.attId));
    if (!att) return res.json({ ok: true });
    const reqRow = await repo.getById(att.rh_request_id);
    if (!reqRow || (reqRow.created_by !== req.user.id && !isSuperAdmin(req.user))) return res.status(403).json({ error: 'Action réservée au demandeur.' });
    if (att.content_key) await blob.del(att.content_key);
    await repo.deleteAttachment(att.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
