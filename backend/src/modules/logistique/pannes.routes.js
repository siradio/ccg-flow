const express = require('express');
const multer = require('multer');
const { all, one, run } = require('../../db');
const blob = require('../../storage/blob');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');

// Déclaration de pannes véhicule (gravité, description, localisation, statut, photos multiples).
const router = express.Router();
router.use(requireAuth);
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('logistique.maintenance');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const GRAVITES = new Set(['Mineure', 'Majeure', 'Critique']);
const STATUTS = new Set(['Déclarée', 'En réparation', 'Réparée', 'Clôturée']);
const clean = v => (v === '' || v === undefined ? null : v);

// Photos (octets en BYTEA) — servies avec auth. Défini avant /:id (deux segments, pas de collision).
router.get('/photos/:photoId', requireSubModule('logistique.maintenance'), async (req, res, next) => {
  try {
    const row = await one('SELECT photo, photo_mime, photo_key FROM panne_photos WHERE id = $1', [Number(req.params.photoId)]);
    if (!row || (!row.photo && !row.photo_key)) return res.status(404).json({ error: 'Photo introuvable.' });
    const buf = row.photo_key ? await blob.getBuffer(row.photo_key) : row.photo;
    res.setHeader('Content-Type', row.photo_mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) { next(e); }
});

router.delete('/photos/:photoId', requireEdit, async (req, res, next) => {
  try { await run('DELETE FROM panne_photos WHERE id = $1', [Number(req.params.photoId)]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

router.get('/', requireSubModule('logistique.maintenance'), async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT p.id, p.reference, p.gravite, p.description, p.localisation, p.statut, p.declare_le, p.vehicle_id,
              v.immatriculation AS vehicle_immat,
              (SELECT COUNT(*) FROM panne_photos pp WHERE pp.panne_id = p.id)::int AS n_photos
       FROM pannes p JOIN vehicles v ON v.id = p.vehicle_id
       ${req.query.vehicle_id ? 'WHERE p.vehicle_id = $1' : ''}
       ORDER BY p.declare_le DESC`,
      req.query.vehicle_id ? [Number(req.query.vehicle_id)] : []
    ));
  } catch (e) { next(e); }
});

router.get('/:id', requireSubModule('logistique.maintenance'), async (req, res, next) => {
  try {
    const p = await one(
      `SELECT p.*, v.immatriculation AS vehicle_immat FROM pannes p JOIN vehicles v ON v.id = p.vehicle_id WHERE p.id = $1`,
      [Number(req.params.id)]
    );
    if (!p) return res.status(404).json({ error: 'Panne introuvable.' });
    const photos = await all('SELECT id FROM panne_photos WHERE panne_id = $1 ORDER BY id', [p.id]);
    res.json({ ...p, photos });
  } catch (e) { next(e); }
});

router.post('/', requireCreate, async (req, res, next) => {
  try {
    const { vehicle_id, gravite, description, localisation } = req.body || {};
    if (!vehicle_id) return res.status(400).json({ error: 'Véhicule requis.' });
    if (!description || !description.trim()) return res.status(400).json({ error: 'Description requise.' });
    const g = GRAVITES.has(gravite) ? gravite : 'Majeure';
    const p = await one(
      `INSERT INTO pannes (vehicle_id, gravite, description, localisation, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [Number(vehicle_id), g, description.trim(), clean(localisation), req.user.id]
    );
    const withRef = await one('UPDATE pannes SET reference = $1 WHERE id = $2 RETURNING *', [`PN-${String(p.id).padStart(4, '0')}`, p.id]);
    res.status(201).json({ ...withRef, photos: [] });
  } catch (e) { next(e); }
});

router.put('/:id', requireEdit, async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM pannes WHERE id = $1', [Number(req.params.id)]);
    if (!existing) return res.status(404).json({ error: 'Panne introuvable.' });
    const { gravite, description, localisation, statut } = req.body || {};
    const row = await one(
      `UPDATE pannes SET gravite = $1, description = $2, localisation = $3, statut = $4 WHERE id = $5 RETURNING *`,
      [
        GRAVITES.has(gravite) ? gravite : existing.gravite,
        (description && description.trim()) || existing.description,
        localisation === undefined ? existing.localisation : clean(localisation),
        STATUTS.has(statut) ? statut : existing.statut,
        Number(req.params.id),
      ]
    );
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/:id', requireEdit, async (req, res, next) => {
  try { await run('DELETE FROM pannes WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

router.post('/:id/photos', requireCreate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    if (!ALLOWED_MIME.has(req.file.mimetype)) return res.status(400).json({ error: 'Formats acceptés : PNG ou JPEG.' });
    const key = await blob.putBuffer(req.file.buffer, req.file.mimetype, 'pannes');
    const row = await one('INSERT INTO panne_photos (panne_id, photo, photo_key, photo_mime) VALUES ($1,$2,$3,$4) RETURNING id',
      [Number(req.params.id), key ? null : req.file.buffer, key, req.file.mimetype]);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

module.exports = router;
