const express = require('express');
const { all, one, run } = require('../../../db');
const { requireAuth } = require('../../../middleware/auth');
const { requireSubModule } = require('../../../middleware/permissions');
const service = require('./depenses.service');
const dashboard = require('./depenses.dashboard');

// Module Logistique → Autorisation de dépense.
//  - Référentiel « Types de dépense » : paramétrable DANS le module Logistique (sous-module
//    logistique.depenses, niveau edition).
//  - Fiches d'autorisation : saisie réservée au sous-module (edition) ; consultation = sous-module
//    OU rôle sur l'entité OU créateur (vérifié dans le service) ; validation = rôle d'entité requis
//    par l'étape du circuit configurable (operations/controle_gestion/daf/dg).
const router = express.Router();
router.use(requireAuth);

const canRead = requireSubModule('logistique.depenses', 'consultation');
const canEdit = requireSubModule('logistique.depenses', 'edition');

// Petit wrapper pour router les erreurs métier (httpError) vers errorHandler.
const h = fn => (req, res, next) => fn(req, res, next).catch(next);

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

// ─── Tableau de bord ─────────────────────────────────────────────────────────
// Placé avant /:id pour ne pas être capté par la route paramétrée.
router.get('/dashboard', canRead, h(async (req, res) => {
  res.json(await dashboard.getDashboard(req.user, req.query));
}));

// ─── Fiches d'autorisation de dépense ─────────────────────────────────────────
router.get('/', h(async (req, res) => {
  res.json(await service.list(req.user, req.query));
}));

router.post('/', canEdit, h(async (req, res) => {
  res.status(201).json(await service.create(req.user, req.body || {}));
}));

router.get('/:id', h(async (req, res) => {
  const a = await service.getFullDetailForUser(req.user, Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Autorisation introuvable.' });
  res.json(a);
}));

router.put('/:id', canEdit, h(async (req, res) => {
  res.json(await service.update(req.user, Number(req.params.id), req.body || {}));
}));

router.delete('/:id', canEdit, h(async (req, res) => {
  res.json(await service.remove(req.user, Number(req.params.id)));
}));

router.post('/:id/submit', canEdit, h(async (req, res) => {
  res.json(await service.submit(req.user, Number(req.params.id)));
}));

// Validation / refus : le droit vient du RÔLE d'entité requis par l'étape (vérifié dans le service),
// pas du sous-module — un valideur (DAF, DGA…) n'a pas forcément logistique.depenses.
router.post('/:id/validate', h(async (req, res) => {
  res.json(await service.validateStep(req.user, Number(req.params.id), (req.body || {}).commentaire));
}));

router.post('/:id/reject', h(async (req, res) => {
  res.json(await service.rejectStep(req.user, Number(req.params.id), (req.body || {}).commentaire));
}));

router.post('/:id/reopen', canEdit, h(async (req, res) => {
  res.json(await service.reopen(req.user, Number(req.params.id)));
}));

router.get('/:id/pdf', h(async (req, res) => {
  const buffer = await service.generatePdf(req.user, Number(req.params.id));
  const a = await service.getFullDetailForUser(req.user, Number(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="autorisation-${(a && a.numero) || req.params.id}.pdf"`);
  res.send(buffer);
}));

module.exports = router;
