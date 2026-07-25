const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireModule } = require('../../middleware/permissions');

const router = express.Router();

async function withEntityIds(product) {
  const rows = await all('SELECT entity_id FROM product_entities WHERE product_id = $1', [product.id]);
  return { ...product, entity_ids: rows.map(r => r.entity_id) };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    let products;
    if (req.query.entity_id) {
      products = await all(
        `SELECT p.* FROM products p
         JOIN product_entities pe ON pe.product_id = p.id
         WHERE pe.entity_id = $1
         ORDER BY p.designation`,
        [Number(req.query.entity_id)]
      );
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

router.post('/', requireAuth, requireModule('ref_products'), async (req, res, next) => {
  try {
    const { code, designation, category_id, business_unit_id, unite, actif, entity_ids } = req.body || {};
    if (!designation || !category_id) {
      return res.status(400).json({ error: 'designation et category_id obligatoires.' });
    }
    const product = await one(
      'INSERT INTO products (code, designation, category_id, business_unit_id, unite, actif) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [code || null, designation, category_id, business_unit_id || null, unite || null, actif === undefined ? true : actif]
    );
    for (const entityId of entity_ids || []) {
      await run('INSERT INTO product_entities (product_id, entity_id) VALUES ($1,$2)', [product.id, entityId]);
    }
    res.status(201).json(await withEntityIds(product));
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, requireModule('ref_products'), async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Introuvable.' });
    const { code, designation, category_id, business_unit_id, unite, actif, entity_ids } = req.body || {};
    const product = await one(
      'UPDATE products SET code=$1, designation=$2, category_id=$3, business_unit_id=$4, unite=$5, actif=$6 WHERE id=$7 RETURNING *',
      [
        code ?? existing.code,
        designation ?? existing.designation,
        category_id ?? existing.category_id,
        business_unit_id === undefined ? existing.business_unit_id : business_unit_id,
        unite ?? existing.unite,
        actif === undefined ? existing.actif : actif,
        req.params.id,
      ]
    );
    if (entity_ids) {
      await run('DELETE FROM product_entities WHERE product_id = $1', [req.params.id]);
      for (const entityId of entity_ids) {
        await run('INSERT INTO product_entities (product_id, entity_id) VALUES ($1,$2)', [req.params.id, entityId]);
      }
    }
    res.json(await withEntityIds(product));
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireModule('ref_products'), async (req, res, next) => {
  try {
    await run('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
