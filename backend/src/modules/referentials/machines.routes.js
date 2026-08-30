const multer = require('multer');
const { simpleCrudRouter } = require('./crud.factory');
const { one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModuleWrite } = require('../../middleware/permissions');
const blob = require('../../storage/blob');

// CRUD générique (dates comprises) + routes photo greffées dessus. `has_photo` est exposé en lecture
// (booléen) pour afficher une vignette sans transférer les octets sur chaque chargement de liste.
const router = simpleCrudRouter({
  table: 'machines',
  columns: [
    'site_id', 'nom', 'code', 'categorie', 'actif',
    'calendrier_travail', 'capacite', 'cadence', 'efficacite_pct',
    'temps_preparation_min', 'temps_nettoyage_min', 'cout_horaire', 'oee_cible_pct',
    'description', 'date_fabrication', 'date_acquisition',
  ],
  filterColumn: 'site_id',
  orderBy: 'nom',
  subModuleKey: 'referentiels.machines',
  extraSelect: '(photo IS NOT NULL OR photo_key IS NOT NULL) AS has_photo',
});

// Photo de la machine — même stockage/transport que le branding des entités : octets en BYTEA,
// upload multipart via multer en mémoire, service authentifié des octets. 4 Mo, PNG/JPEG.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const { edit: requireEdit } = requireSubModuleWrite('referentiels.machines');

// Sert les octets de la photo (auth simple, comme l'aperçu du branding).
router.get('/:id/photo', requireAuth, async (req, res, next) => {
  try {
    const row = await one('SELECT photo, photo_mime, photo_key FROM machines WHERE id = $1', [Number(req.params.id)]);
    if (!row || (!row.photo && !row.photo_key)) return res.status(404).json({ error: 'Aucune photo.' });
    const buf = row.photo_key ? await blob.getBuffer(row.photo_key) : row.photo;
    res.setHeader('Content-Type', row.photo_mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) { next(e); }
});

// Upload / remplacement de la photo (niveau édition sur le sous-module machines).
router.put('/:id/photo', requireAuth, requireEdit, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    if (!ALLOWED_MIME.has(req.file.mimetype)) return res.status(400).json({ error: 'Formats acceptés : PNG ou JPEG.' });
    const key = await blob.putBuffer(req.file.buffer, req.file.mimetype, 'machines');
    await run('UPDATE machines SET photo = $1, photo_key = $2, photo_mime = $3 WHERE id = $4', [key ? null : req.file.buffer, key, req.file.mimetype, Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id/photo', requireAuth, requireEdit, async (req, res, next) => {
  try {
    await run('UPDATE machines SET photo = NULL, photo_mime = NULL WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
