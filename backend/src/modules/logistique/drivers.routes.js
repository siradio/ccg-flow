const { simpleCrudRouter } = require('../referentials/crud.factory');

// Conducteurs (chauffeurs). Rattaché au sous-module Parc. employee_id facultatif : un chauffeur
// externe/intérimaire n'a pas de fiche RH.
module.exports = simpleCrudRouter({
  table: 'drivers',
  columns: ['employee_id', 'nom', 'prenom', 'telephone', 'permis_numero', 'permis_categories', 'permis_validite', 'actif'],
  orderBy: 'nom, prenom',
  subModuleKey: 'logistique.parc',
});
