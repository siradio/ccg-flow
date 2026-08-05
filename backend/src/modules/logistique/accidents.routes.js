const express = require('express');
const multer = require('multer');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');

// Déclaration d'accidents véhicule (tiers impliqué, statut, justificatifs/photos multiples).
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('logistique.accidents');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const STATUTS = new Set(['Déclaré', 'En cours', 'Clôturé']);
const clean = v => (v === '' || v === undefined ? null : v);

router.get('/photos/:photoId', requireSubModule('logistique.accidents'), async (req, res, next) => {
  try {
    const row = await one('SELECT photo, photo_mime FROM accident_photos WHERE id = $1', [Number(req.params.photoId)]);
    if (!row || !row.photo) return res.status(404).json({ error: 'Photo introuvable.' });
    res.setHeader('Content-Type', row.photo_mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(row.photo);
  } catch (e) { next(e); }
});

router.delete('/photos/:photoId', requireEdit, async (req, res, next) => {
  try { await run('DELETE FROM accident_photos WHERE id = $1', [Number(req.params.photoId)]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

router.get('/', requireSubModule('logistique.accidents'), async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT a.id, a.reference, a.description, a.localisation, a.tiers_implique, a.statut, a.declare_le, a.vehicle_id,
              v.immatriculation AS vehicle_immat,
              (SELECT COUNT(*) FROM accident_photos ap WHERE ap.accident_id = a.id)::int AS n_photos
       FROM accidents a JOIN vehicles v ON v.id = a.vehicle_id
       ${req.query.vehicle_id ? 'WHERE a.vehicle_id = $1' : ''}
       ORDER BY a.declare_le DESC`,
      req.query.vehicle_id ? [Number(req.query.vehicle_id)] : []
    ));
  } catch (e) { next(e); }
});

router.get('/:id', requireSubModule('logistique.accidents'), async (req, res, next) => {
  try {
    const a = await one(`SELECT a.*, v.immatriculation AS vehicle_immat FROM accidents a JOIN vehicles v ON v.id = a.vehicle_id WHERE a.id = $1`, [Number(req.params.id)]);
    if (!a) return res.status(404).json({ error: 'Accident introuvable.' });
    const photos = await all('SELECT id FROM accident_photos WHERE accident_id = $1 ORDER BY id', [a.id]);
    res.json({ ...a, photos });
  } catch (e) { next(e); }
});

router.post('/', requireCreate, async (req, res, next) => {
  try {
    const { vehicle_id, description, localisation, tiers_implique } = req.body || {};
    if (!vehicle_id) return res.status(400).json({ error: 'Véhicule requis.' });
    if (!description || !description.trim()) return res.status(400).json({ error: 'Description requise.' });
    const a = await one(
      `INSERT INTO accidents (vehicle_id, description, localisation, tiers_implique, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [Number(vehicle_id), description.trim(), clean(localisation), !!tiers_implique, req.user.id]
    );
    const withRef = await one('UPDATE accidents SET reference = $1 WHERE id = $2 RETURNING *', [`AC-${String(a.id).padStart(4, '0')}`, a.id]);
    res.status(201).json({ ...withRef, photos: [] });
  } catch (e) { next(e); }
});

router.put('/:id', requireEdit, async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM accidents WHERE id = $1', [Number(req.params.id)]);
    if (!existing) return res.status(404).json({ error: 'Accident introuvable.' });
    const { description, localisation, tiers_implique, statut } = req.body || {};
    const row = await one(
      `UPDATE accidents SET description = $1, localisation = $2, tiers_implique = $3, statut = $4 WHERE id = $5 RETURNING *`,
      [
        (description && description.trim()) || existing.description,
        localisation === undefined ? existing.localisation : clean(localisation),
        tiers_implique === undefined ? existing.tiers_implique : !!tiers_implique,
        STATUTS.has(statut) ? statut : existing.statut,
        Number(req.params.id),
      ]
    );
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/:id', requireEdit, async (req, res, next) => {
  try { await run('DELETE FROM accidents WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

router.post('/:id/photos', requireCreate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    if (!ALLOWED_MIME.has(req.file.mimetype)) return res.status(400).json({ error: 'Formats acceptés : PNG ou JPEG.' });
    const row = await one('INSERT INTO accident_photos (accident_id, photo, photo_mime) VALUES ($1,$2,$3) RETURNING id',
      [Number(req.params.id), req.file.buffer, req.file.mimetype]);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

module.exports = router;
