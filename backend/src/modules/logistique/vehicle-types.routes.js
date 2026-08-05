const { simpleCrudRouter } = require('../referentials/crud.factory');

// Petit référentiel des types de véhicule (VL, PL, engin…), rattaché au sous-module Parc.
module.exports = simpleCrudRouter({
  table: 'vehicle_types',
  columns: ['code', 'nom'],
  orderBy: 'nom',
  subModuleKey: 'logistique.parc',
});
