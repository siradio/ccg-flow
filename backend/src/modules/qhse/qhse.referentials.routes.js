// Module QHSE — Lot 0. Référentiels du laboratoire exposés via la factory CRUD générique
// (lecture ouverte aux authentifiés, écriture gated sur le sous-module `qhse.referentiels`).
// Montés sous /api/qhse/referentials/* (voir server.js).
const express = require('express');
const { simpleCrudRouter } = require('../referentials/crud.factory');

const router = express.Router();
const SUB = 'qhse.referentiels';

router.use('/analysis-types', simpleCrudRouter({
  table: 'qhse_analysis_types',
  columns: ['code', 'libelle', 'ordre', 'actif'],
  orderBy: 'ordre, libelle',
  subModuleKey: SUB,
}));

router.use('/parameters', simpleCrudRouter({
  table: 'qhse_parameters',
  columns: ['analysis_type_id', 'code', 'libelle', 'unite', 'type_resultat', 'methode', 'precision_decimales', 'obligatoire', 'ordre', 'actif'],
  filterColumn: 'analysis_type_id',
  orderBy: 'ordre, libelle',
  subModuleKey: SUB,
}));

router.use('/culture-media', simpleCrudRouter({
  table: 'qhse_culture_media',
  columns: ['code', 'libelle', 'ordre', 'actif'],
  orderBy: 'ordre, libelle',
  subModuleKey: SUB,
}));

router.use('/germs', simpleCrudRouter({
  table: 'qhse_germs',
  columns: ['code', 'libelle', 'ordre', 'actif'],
  orderBy: 'ordre, libelle',
  subModuleKey: SUB,
}));

// Vocabulaires contrôlés (migration 114) : lignes, saveurs, formats, types de prélèvement, gravités NC.
const lookupCols = ['code', 'libelle', 'ordre', 'actif'];
router.use('/conditioning-lines', simpleCrudRouter({ table: 'qhse_conditioning_lines', columns: lookupCols, orderBy: 'ordre, libelle', subModuleKey: SUB }));
router.use('/flavors', simpleCrudRouter({ table: 'qhse_flavors', columns: lookupCols, orderBy: 'ordre, libelle', subModuleKey: SUB }));
router.use('/formats', simpleCrudRouter({ table: 'qhse_formats', columns: lookupCols, orderBy: 'ordre, libelle', subModuleKey: SUB }));
router.use('/sampling-types', simpleCrudRouter({ table: 'qhse_sampling_types', columns: lookupCols, orderBy: 'ordre, libelle', subModuleKey: SUB }));
router.use('/nc-severities', simpleCrudRouter({ table: 'qhse_nc_severities', columns: lookupCols, orderBy: 'ordre, libelle', subModuleKey: SUB }));

module.exports = router;
