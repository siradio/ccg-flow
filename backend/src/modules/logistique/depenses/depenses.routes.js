const express = require('express');
const { all, one, run } = require('../../../db');
const { requireAuth } = require('../../../middleware/auth');
const { requireSubModule } = require('../../../middleware/permissions');

// Module Logistique → Autorisation de dépense.
// Lot 0 : référentiel « Types de dépense », paramétrable DANS le module Logistique (pas dans
// l'admin global). Lecture = consultation ; écriture = edition sur le sous-module logistique.depenses.
const router = express.Router();
router.use(requireAuth);

const canRead = requireSubModule('logistique.depenses', 'consultation');
const canEdit = requireSubModule('logistique.depenses', 'edition');

// ─── Types de dépense (référentiel) ───────────────────────────────────────────
router.get('/expense-types', canRead, async (req, res, next) => {
  try {
    const activeOnly = req.query.actifs === 'true';
    res.json(await all(
      `SELECT id, libelle, ordre, actif FROM logistique_expense_types
       ${activeOnly ? 'WHERE actif = true' : ''} ORDER BY ordre, libelle`
    ));
  } catch (e) { next(e); }
});

router.post('/expense-types', canEdit, async (req, res, next) => {
  try {
    const libelle = (req.body.libelle || '').trim();
    if (!libelle) return res.status(400).json({ error: 'Le libellé est obligatoire.' });
    const ordre = Number.isFinite(Number(req.body.ordre)) ? Number(req.body.ordre) : 0;
    res.status(201).json(await one(
      'INSERT INTO logistique_expense_types (libelle, ordre) VALUES ($1,$2) RETURNING id, libelle, ordre, actif',
      [libelle, ordre]
    ));
  } catch (e) { next(e); }
});

router.put('/expense-types/:id', canEdit, async (req, res, next) => {
  try {
    const { libelle, ordre, actif } = req.body || {};
    const row = await one(
      `UPDATE logistique_expense_types
         SET libelle = COALESCE($2, libelle),
             ordre   = COALESCE($3, ordre),
             actif   = COALESCE($4, actif),
             updated_at = now()
       WHERE id = $1 RETURNING id, libelle, ordre, actif`,
      [Number(req.params.id),
       libelle !== undefined ? String(libelle).trim() : null,
       ordre !== undefined ? Number(ordre) : null,
       actif !== undefined ? !!actif : null]
    );
    if (!row) return res.status(404).json({ error: 'Type introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/expense-types/:id', canEdit, async (req, res, next) => {
  try {
    // Si le type est déjà utilisé par une autorisation, la contrainte FK empêche la suppression :
    // on le désactive alors proprement plutôt que d'échouer.
    const used = await one('SELECT 1 FROM expense_authorizations WHERE expense_type_id = $1 LIMIT 1', [Number(req.params.id)]);
    if (used) {
      await run('UPDATE logistique_expense_types SET actif = false, updated_at = now() WHERE id = $1', [Number(req.params.id)]);
      return res.json({ ok: true, deactivated: true });
    }
    await run('DELETE FROM logistique_expense_types WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
