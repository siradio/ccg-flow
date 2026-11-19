const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModuleWrite } = require('../../middleware/permissions');

const router = express.Router();
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('referentiels.products');

// Colonnes optionnelles éditables du produit (au-delà de designation + category_id obligatoires).
// Inclut les attributs stock / matière première ajoutés par la migration 047.
// NB : `type_article` n'est plus saisi : il est DÉRIVÉ de la catégorie (voir typeFromCategory),
// qui porte déjà la distinction produit fini / matière première / consommable. Il reste utilisé par
// Commerce / Stock / Production (filtres), d'où l'importance de le garder correctement renseigné.
const OPTIONAL_COLS = [
  'code', 'business_unit_id', 'unite', 'actif', 'seuil_alerte_stock',
  'code_barres', 'sous_categorie', 'marque',
  'unite_vente', 'unite_conso', 'coef_conversion',
  // Conditionnement/poids (module Production — harmonisation tonnes). poids_unitaire_g est GÉNÉRÉE → non éditable.
  'pds_format', 'pds_unites_par_colis', 'pds_unite',
  'cout_standard', 'prix_vente_ht', 'seuil_max', 'stock_securite',
  'delai_reappro_jours', 'gere_par_lot', 'gere_peremption', 'duree_conservation_jours',
  'methode_valorisation', 'fournisseur_principal_id',
];
const emptyToNull = v => (v === '' || v === undefined ? null : v);

// type_article dérivé du code de la catégorie (même logique que la migration 047). Les catégories
// « métier » (produit_fini / matiere_premiere / consommable) donnent le type ; tout le reste → 'autre'.
const CAT_CODE_TO_TYPE = { produit_fini: 'produit_fini', matiere_premiere: 'matiere_premiere', consommable: 'consommable' };
async function typeFromCategory(categoryId) {
  if (!categoryId) return 'autre';
  const cat = await one('SELECT code FROM product_categories WHERE id = $1', [categoryId]);
  return (cat && CAT_CODE_TO_TYPE[cat.code]) || 'autre';
}

async function withEntityIds(product) {
  const rows = await all('SELECT entity_id FROM product_entities WHERE product_id = $1', [product.id]);
  return { ...product, entity_ids: rows.map(r => r.entity_id) };
}

async function setEntities(productId, entityIds) {
  await run('DELETE FROM product_entities WHERE product_id = $1', [productId]);
  for (const entityId of entityIds || []) {
    await run('INSERT INTO product_entities (product_id, entity_id) VALUES ($1,$2)', [productId, entityId]);
  }
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    let products;
    if (req.query.entity_id) {
      products = await all(
        `SELECT p.* FROM products p JOIN product_entities pe ON pe.product_id = p.id
         WHERE pe.entity_id = $1 ORDER BY p.designation`, [Number(req.query.entity_id)]);
    } else {
      products = await all('SELECT * FROM products ORDER BY designation');
    }
    res.json(await Promise.all(products.map(withEntityIds)));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const product = await one('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Introuvable.' });
    res.json(await withEntityIds(product));
  } catch (e) { next(e); }
});

router.post('/', requireAuth, requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.designation || !b.category_id) return res.status(400).json({ error: 'designation et category_id obligatoires.' });
    // N'insère que les colonnes réellement fournies → les défauts SQL (actif, methode_valorisation…) s'appliquent.
    const provided = OPTIONAL_COLS.filter(c => b[c] !== undefined);
    const typeArticle = await typeFromCategory(b.category_id);
    const cols = ['designation', 'category_id', 'type_article', ...provided];
    const vals = [b.designation, b.category_id, typeArticle, ...provided.map(c => emptyToNull(b[c]))];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const product = await one(`INSERT INTO products (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`, vals);
    await setEntities(product.id, b.entity_ids);
    res.status(201).json(await withEntityIds(product));
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Introuvable.' });
    const b = req.body || {};
    // Clé absente du body → on garde l'existant ; clé présente (même vide) → mise à jour (vide = NULL).
    const editable = ['designation', 'category_id', ...OPTIONAL_COLS].filter(c => b[c] !== undefined);
    // type_article toujours re-dérivé de la catégorie effective (nouvelle si fournie, sinon existante),
    // pour rester cohérent avec les filtres Commerce / Stock / Production.
    const effectiveCategory = b.category_id !== undefined ? b.category_id : existing.category_id;
    const cols = [...editable, 'type_article'];
    const vals = [...editable.map(c => emptyToNull(b[c])), await typeFromCategory(effectiveCategory)];
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    await one(`UPDATE products SET ${setClause} WHERE id = $${cols.length + 1} RETURNING *`, [...vals, req.params.id]);
    if (b.entity_ids) await setEntities(req.params.id, b.entity_ids);
    res.json(await withEntityIds(await one('SELECT * FROM products WHERE id = $1', [req.params.id])));
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    await run('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
