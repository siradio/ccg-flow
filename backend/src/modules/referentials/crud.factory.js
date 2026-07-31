// Fabrique de routeur CRUD générique pour les référentiels "simples" (une table, pas de junction).
// Lecture ouverte à tout utilisateur authentifié ; écriture par niveau sur le sous-module
// correspondant (voir SPEC.md §2.3, config/modules.js) — ajout >= 'ajout', modification/
// suppression >= 'edition', donnant enfin une vraie distinction créer/modifier là où l'accès
// était binaire auparavant.
const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModuleWrite } = require('../../middleware/permissions');

function simpleCrudRouter({ table, columns, filterColumn, orderBy, subModuleKey }) {
  const router = express.Router();
  const cols = columns.join(', ');
  const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite(subModuleKey);

  router.get('/', requireAuth, async (req, res, next) => {
    try {
      if (filterColumn && req.query[filterColumn]) {
        res.json(await all(
          `SELECT id, ${cols} FROM ${table} WHERE ${filterColumn} = $1 ORDER BY ${orderBy}`,
          [Number(req.query[filterColumn])]
        ));
      } else {
        res.json(await all(`SELECT id, ${cols} FROM ${table} ORDER BY ${orderBy}`));
      }
    } catch (e) { next(e); }
  });

  router.get('/:id', requireAuth, async (req, res, next) => {
    try {
      const row = await one(`SELECT id, ${cols} FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Introuvable.' });
      res.json(row);
    } catch (e) { next(e); }
  });

  router.post('/', requireAuth, requireCreate, async (req, res, next) => {
    try {
      const values = columns.map(c => req.body[c] ?? null);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const row = await one(
        `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING id, ${cols}`,
        values
      );
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  router.put('/:id', requireAuth, requireEdit, async (req, res, next) => {
    try {
      const existing = await one(`SELECT id, ${cols} FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Introuvable.' });
      const values = columns.map(c => req.body[c] ?? existing[c]);
      const setClause = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const row = await one(
        `UPDATE ${table} SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id, ${cols}`,
        [...values, req.params.id]
      );
      res.json(row);
    } catch (e) { next(e); }
  });

  router.delete('/:id', requireAuth, requireEdit, async (req, res, next) => {
    try {
      await run(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { simpleCrudRouter };
