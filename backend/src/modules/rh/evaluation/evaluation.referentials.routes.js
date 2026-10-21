const express = require('express');
const { simpleCrudRouter } = require('../../referentials/crud.factory');

// Référentiel de compétences du module Évaluation annuelle : catégories + compétences, gérées par
// les RH (sous-module `rh`). Lecture ouverte (authentifié) ; écriture = niveau sur `rh`.
const router = express.Router();

router.use('/categories', simpleCrudRouter({
  table: 'rh_competence_categories',
  columns: ['code', 'libelle', 'ordre', 'actif'],
  filterColumn: 'actif',
  orderBy: 'ordre, libelle',
  subModuleKey: 'rh',
}));

router.use('/competences', simpleCrudRouter({
  table: 'rh_competences',
  columns: ['category_id', 'code', 'libelle', 'description', 'ordre', 'actif'],
  filterColumn: 'category_id',
  orderBy: 'ordre, libelle',
  subModuleKey: 'rh',
  extraSelect: '(SELECT c.libelle FROM rh_competence_categories c WHERE c.id = rh_competences.category_id) AS category_libelle',
}));

module.exports = router;
