const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');

// Module « Liens utiles » : catégories (sous-menus) extensibles + liens (titre, description, URL).
// Lecture pour tout détenteur du module ; ajout ('ajout'), gestion des catégories/liens ('edition').
// Calqué sur le module Documents, avec une URL à la place d'un fichier.
const router = express.Router();
router.use(requireAuth);

function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cat';
}

// --- Catégories -----------------------------------------------------------------------------
router.get('/categories', requireSubModule('liens'), async (req, res, next) => {
  try { res.json(await all('SELECT id, nom, slug, ordre FROM link_categories ORDER BY ordre, nom')); }
  catch (e) { next(e); }
});

router.post('/categories', requireSubModule('liens', 'edition'), async (req, res, next) => {
  try {
    const nom = (req.body && req.body.nom || '').trim();
    if (!nom) return res.status(400).json({ error: 'Le nom de la catégorie est obligatoire.' });
    const base = slugify(nom); let slug = base; let i = 2;
    while (await one('SELECT 1 FROM link_categories WHERE slug = $1', [slug])) slug = `${base}-${i++}`;
    const ord = await one('SELECT COALESCE(MAX(ordre), 0) + 1 AS n FROM link_categories');
    const row = await one('INSERT INTO link_categories (nom, slug, ordre) VALUES ($1,$2,$3) RETURNING id, nom, slug, ordre', [nom, slug, ord.n]);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// Renommage : on ne change que le nom affiché, jamais le slug (URL / sous-menu).
router.put('/categories/:id', requireSubModule('liens', 'edition'), async (req, res, next) => {
  try {
    const nom = (req.body && req.body.nom || '').trim();
    if (!nom) return res.status(400).json({ error: 'Le nom est obligatoire.' });
    const row = await one('UPDATE link_categories SET nom = $1 WHERE id = $2 RETURNING id, nom, slug, ordre', [nom, Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Catégorie introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/categories/:id', requireSubModule('liens', 'edition'), async (req, res, next) => {
  try {
    // Les liens rattachés basculent en « sans catégorie » (ON DELETE SET NULL), jamais supprimés.
    await run('DELETE FROM link_categories WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// --- Liens ----------------------------------------------------------------------------------
router.get('/', requireSubModule('liens'), async (req, res, next) => {
  try {
    const params = []; let where = '';
    if (req.query.category) { params.push(req.query.category); where = 'WHERE c.slug = $1'; }
    res.json(await all(
      `SELECT l.id, l.titre, l.description, l.url, l.created_at, l.category_id,
              c.slug AS category_slug, c.nom AS category_nom,
              u.prenom AS auteur_prenom, u.nom AS auteur_nom
       FROM useful_links l
       LEFT JOIN link_categories c ON c.id = l.category_id
       LEFT JOIN users u ON u.id = l.created_by
       ${where}
       ORDER BY l.created_at DESC`,
      params
    ));
  } catch (e) { next(e); }
});

router.post('/', requireSubModule('liens', 'ajout'), async (req, res, next) => {
  try {
    const { titre, description, url, categoryId, category } = req.body || {};
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est obligatoire.' });
    if (!url || !url.trim()) return res.status(400).json({ error: 'Le lien (URL) est obligatoire.' });
    let catId = categoryId ? Number(categoryId) : null;
    if (!catId && category) {
      const c = await one('SELECT id FROM link_categories WHERE slug = $1', [category]);
      catId = c ? c.id : null;
    }
    const row = await one(
      `INSERT INTO useful_links (category_id, titre, description, url, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, titre, description, url, created_at, category_id`,
      [catId, titre.trim(), (description || '').trim() || null, url.trim(), req.user.id]
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', requireSubModule('liens', 'edition'), async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM useful_links WHERE id = $1', [Number(req.params.id)]);
    if (!existing) return res.status(404).json({ error: 'Lien introuvable.' });
    const { titre, description, url } = req.body || {};
    const row = await one(
      `UPDATE useful_links SET titre = $1, description = $2, url = $3 WHERE id = $4
       RETURNING id, titre, description, url, created_at, category_id`,
      [
        (titre && titre.trim()) || existing.titre,
        description === undefined ? existing.description : ((description || '').trim() || null),
        (url && url.trim()) || existing.url,
        Number(req.params.id),
      ]
    );
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/:id', requireSubModule('liens', 'edition'), async (req, res, next) => {
  try {
    await run('DELETE FROM useful_links WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
