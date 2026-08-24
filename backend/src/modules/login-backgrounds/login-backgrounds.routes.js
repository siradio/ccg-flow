const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../../middleware/auth');
const { requireSuperAdmin } = require('../../middleware/permissions');
const service = require('./login-backgrounds.service');

// Administration des habillages de la page de connexion — réservé au super_admin.
// (Les routes PUBLIQUES de lecture/affichage sont dans public.routes.js, sans auth.)
const router = express.Router();
router.use(requireAuth, requireSuperAdmin);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

router.get('/', async (req, res, next) => {
  try { res.json(await service.list()); } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const nom = (req.body.nom || '').trim();
    if (!nom) return res.status(400).json({ error: 'Le nom est obligatoire.' });
    res.status(201).json(await service.create({ nom, message: (req.body.message || '').trim() }));
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const row = await service.update(Number(req.params.id), {
      nom: (req.body.nom || '').trim(),
      message: (req.body.message || '').trim(),
    });
    if (!row) return res.status(404).json({ error: 'Habillage introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.put('/:id/active', async (req, res, next) => {
  try {
    const row = await service.activate(Number(req.params.id), !!req.body.actif);
    if (!row) return res.status(404).json({ error: 'Habillage introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.put('/:id/image', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    if (!ALLOWED_MIME.has(req.file.mimetype)) return res.status(400).json({ error: 'Formats acceptés : PNG, JPEG ou WebP.' });
    const row = await service.setImage(Number(req.params.id), req.file.buffer, req.file.mimetype);
    if (!row) return res.status(404).json({ error: 'Habillage introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

// Aperçu de l'image dans l'écran d'admin (authentifié).
router.get('/:id/image', async (req, res, next) => {
  try {
    const img = await service.getImageBytes(Number(req.params.id));
    if (!img) return res.status(404).json({ error: 'Aucune image.' });
    res.setHeader('Content-Type', img.mime);
    res.setHeader('Cache-Control', 'no-store');
    res.send(img.buffer);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await service.remove(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
