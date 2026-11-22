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

// Spécifications / seuils de conformité (Lot 1) — migration 115.
router.use('/specifications', simpleCrudRouter({
  table: 'qhse_specifications',
  columns: ['parameter_id', 'product_id', 'category_id', 'format_id', 'seuil_min', 'seuil_max', 'critere', 'version', 'date_effet', 'actif'],
  orderBy: 'parameter_id, version DESC, id DESC',
  subModuleKey: SUB,
}));

// Lot 2 — critères de contrôle production + plans d'échantillonnage (migration 118).
router.use('/production-criteria', simpleCrudRouter({
  table: 'qhse_production_criteria',
  columns: ['code', 'libelle', 'type_critere', 'unite', 'seuil_min', 'seuil_max', 'ordre', 'actif'],
  orderBy: 'ordre, libelle',
  subModuleKey: SUB,
}));
router.use('/sampling-plans', simpleCrudRouter({
  table: 'qhse_sampling_plans',
  columns: ['code', 'libelle', 'parameter_id', 'product_id', 'category_id', 'format_id', 'taille_n', 'acceptation_c', 'seuil_m', 'seuil_grand_m', 'ordre', 'actif'],
  orderBy: 'ordre, libelle',
  subModuleKey: SUB,
}));

module.exports = router;
