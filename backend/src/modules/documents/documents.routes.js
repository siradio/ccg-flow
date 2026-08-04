const express = require('express');
const multer = require('multer');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');

// Module "Documents" : catégories (sous-menus) extensibles + manuels/templates téléversés.
// Lecture/téléchargement pour tout détenteur du module ; ajout ("ajout") et suppression/gestion
// des catégories ("edition") gatés.
const router = express.Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cat';
}

// --- Catégories (sous-menus) ---------------------------------------------------------------
router.get('/categories', requireSubModule('documents'), async (req, res, next) => {
  try { res.json(await all('SELECT id, nom, slug, ordre FROM document_categories ORDER BY ordre, nom')); }
  catch (e) { next(e); }
});

router.post('/categories', requireSubModule('documents', 'edition'), async (req, res, next) => {
  try {
    const nom = (req.body && req.body.nom || '').trim();
    if (!nom) return res.status(400).json({ error: 'Le nom de la catégorie est obligatoire.' });
    const base = slugify(nom);
    let slug = base; let i = 2;
    while (await one('SELECT 1 FROM document_categories WHERE slug = $1', [slug])) slug = `${base}-${i++}`;
    const ord = await one('SELECT COALESCE(MAX(ordre), 0) + 1 AS n FROM document_categories');
    const row = await one('INSERT INTO document_categories (nom, slug, ordre) VALUES ($1,$2,$3) RETURNING id, nom, slug, ordre', [nom, slug, ord.n]);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// Renommage : on ne change QUE le nom affiché, jamais le slug (qui sert d'URL et de sous-menu),
// pour ne pas casser les liens/onglets existants.
router.put('/categories/:id', requireSubModule('documents', 'edition'), async (req, res, next) => {
  try {
    const nom = (req.body && req.body.nom || '').trim();
    if (!nom) return res.status(400).json({ error: 'Le nom est obligatoire.' });
    const row = await one('UPDATE document_categories SET nom = $1 WHERE id = $2 RETURNING id, nom, slug, ordre', [nom, Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Catégorie introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/categories/:id', requireSubModule('documents', 'edition'), async (req, res, next) => {
  try {
    // Les documents rattachés basculent en "sans catégorie" (ON DELETE SET NULL) plutôt que d'être
    // supprimés — on ne perd jamais un fichier en retirant une catégorie.
    await run('DELETE FROM document_categories WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// --- Documents ------------------------------------------------------------------------------
router.get('/', requireSubModule('documents'), async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.category) { params.push(req.query.category); where = 'WHERE c.slug = $1'; }
    res.json(await all(
      `SELECT d.id, d.nom, d.description, d.filename, d.mime, d.created_at, d.category_id,
              c.slug AS category_slug, c.nom AS category_nom,
              u.prenom AS uploader_prenom, u.nom AS uploader_nom
       FROM procedure_documents d
       LEFT JOIN document_categories c ON c.id = d.category_id
       LEFT JOIN users u ON u.id = d.uploaded_by
       ${where}
       ORDER BY d.created_at DESC`,
      params
    ));
  } catch (e) { next(e); }
});

router.get('/:id/file', requireSubModule('documents'), async (req, res, next) => {
  try {
    const doc = await one('SELECT filename, mime, data FROM procedure_documents WHERE id = $1', [Number(req.params.id)]);
    if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
    res.setHeader('Content-Type', doc.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename || 'document')}"`);
    res.send(doc.data);
  } catch (e) { next(e); }
});

router.post('/', requireSubModule('documents', 'ajout'), upload.single('file'), async (req, res, next) => {
  try {
    const { nom, description, categoryId, category } = req.body || {};
    if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    let catId = categoryId ? Number(categoryId) : null;
    if (!catId && category) {
      const c = await one('SELECT id FROM document_categories WHERE slug = $1', [category]);
      catId = c ? c.id : null;
    }
    const row = await one(
      `INSERT INTO procedure_documents (category_id, nom, description, filename, mime, data, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nom, description, filename, mime, created_at, category_id`,
      [catId, nom.trim(), (description || '').trim() || null, req.file.originalname, req.file.mimetype, req.file.buffer, req.user.id]
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.delete('/:id', requireSubModule('documents', 'edition'), async (req, res, next) => {
  try {
    await run('DELETE FROM procedure_documents WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
