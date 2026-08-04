const multer = require('multer');
const { simpleCrudRouter } = require('./crud.factory');
const { requireAuth } = require('../../middleware/auth');
const { requireSuperAdmin } = require('../../middleware/permissions');
const branding = require('./entity-branding.service');

// Le routeur CRUD de base (lecture ouverte, écriture gated) auquel on greffe les routes de branding
// (logo / signature / cachet par entité). Ces chemins ont plus de segments que `/:id`, donc pas de
// conflit avec les routes CRUD ci-dessus.
const router = simpleCrudRouter({
  table: 'entities',
  columns: ['code', 'nom'],
  orderBy: 'nom',
  subModuleKey: 'referentiels.entities',
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg']);

// Quels éléments de branding sont définis (booléens) — pour l'écran d'administration.
router.get('/:id/branding', requireAuth, async (req, res, next) => {
  try { res.json(await branding.getBrandingFlags(Number(req.params.id))); }
  catch (e) { next(e); }
});

// Aperçu / récupération d'un élément (logo|signature|stamp). Auth simple : sert à l'affichage admin.
router.get('/:id/branding/:kind', requireAuth, async (req, res, next) => {
  try {
    if (!branding.isValidKind(req.params.kind)) return res.status(400).json({ error: 'Type invalide.' });
    const item = await branding.getBranding(Number(req.params.id), req.params.kind);
    if (!item) return res.status(404).json({ error: 'Aucune image.' });
    res.setHeader('Content-Type', item.mime);
    res.setHeader('Cache-Control', 'no-store');
    res.send(item.data);
  } catch (e) { next(e); }
});

// Upload (super_admin) : PNG ou JPEG, 4 Mo max.
router.put('/:id/branding/:kind', requireAuth, requireSuperAdmin, upload.single('file'), async (req, res, next) => {
  try {
    if (!branding.isValidKind(req.params.kind)) return res.status(400).json({ error: 'Type invalide.' });
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    if (!ALLOWED_MIME.has(req.file.mimetype)) return res.status(400).json({ error: 'Formats acceptés : PNG ou JPEG.' });
    await branding.setBranding(Number(req.params.id), req.params.kind, req.file.buffer, req.file.mimetype);
    res.json({ ok: true, kind: req.params.kind });
  } catch (e) { next(e); }
});

router.delete('/:id/branding/:kind', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    if (!branding.isValidKind(req.params.kind)) return res.status(400).json({ error: 'Type invalide.' });
    await branding.clearBranding(Number(req.params.id), req.params.kind);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
