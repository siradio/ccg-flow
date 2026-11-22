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

module.exports = router;
