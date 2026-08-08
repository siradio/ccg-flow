const express = require('express');
const { all } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { visibleBusinessUnitIds } = require('../../middleware/permissions');
const { simpleCrudRouter } = require('./crud.factory');

const router = express.Router();

// Business Units VISIBLES par l'utilisateur courant — sert aux sélecteurs des écrans scopés BU
// (relevé stock/production…) pour qu'un utilisateur restreint ne voie QUE ses BU. Renvoie toutes
// les BU si aucune restriction (super_admin, ou utilisateur sans octroi précis).
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const visible = visibleBusinessUnitIds(req.user);
    if (visible === null) return res.json(await all('SELECT id, code, nom FROM business_units ORDER BY nom'));
    if (!visible.length) return res.json([]);
    res.json(await all('SELECT id, code, nom FROM business_units WHERE id = ANY($1) ORDER BY nom', [visible]));
  } catch (e) { next(e); }
});

// CRUD complet du référentiel (liste complète pour l'admin/référentiels, écriture par sous-module).
router.use(simpleCrudRouter({
  table: 'business_units',
  columns: ['code', 'nom'],
  orderBy: 'nom',
  subModuleKey: 'referentiels.business_units',
}));

module.exports = router;
