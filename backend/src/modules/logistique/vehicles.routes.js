const multer = require('multer');
const { simpleCrudRouter } = require('../referentials/crud.factory');
const { one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModuleWrite } = require('../../middleware/permissions');

// Parc de véhicules. CRUD générique (l'entité reste facultative : parc global par défaut) + routes
// photo greffées, même stockage/transport que la photo des machines (octets en BYTEA, upload multipart,
// service authentifié). `has_photo` exposé en lecture pour la vignette sans transférer les octets.
const router = simpleCrudRouter({
  table: 'vehicles',
  columns: [
    'immatriculation', 'type_id', 'marque', 'modele', 'annee',
    'entity_id', 'site_id', 'statut', 'compteur_km',
    'date_mise_circulation', 'date_acquisition',
  ],
  filterColumn: 'type_id',
  orderBy: 'immatriculation',
  subModuleKey: 'logistique.parc',
  extraSelect: 'photo IS NOT NULL AS has_photo',
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const { edit: requireEdit } = requireSubModuleWrite('logistique.parc');

router.get('/:id/photo', requireAuth, async (req, res, next) => {
  try {
    const row = await one('SELECT photo, photo_mime FROM vehicles WHERE id = $1', [Number(req.params.id)]);
    if (!row || !row.photo) return res.status(404).json({ error: 'Aucune photo.' });
    res.setHeader('Content-Type', row.photo_mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(row.photo);
  } catch (e) { next(e); }
});

router.put('/:id/photo', requireAuth, requireEdit, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    if (!ALLOWED_MIME.has(req.file.mimetype)) return res.status(400).json({ error: 'Formats acceptés : PNG ou JPEG.' });
    await run('UPDATE vehicles SET photo = $1, photo_mime = $2 WHERE id = $3', [req.file.buffer, req.file.mimetype, Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id/photo', requireAuth, requireEdit, async (req, res, next) => {
  try {
    await run('UPDATE vehicles SET photo = NULL, photo_mime = NULL WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
