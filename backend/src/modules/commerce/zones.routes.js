const { simpleCrudRouter } = require('../referentials/crud.factory');

// Zones commerciales — référentiel minimal, rattaché aux commerciaux et affectations. Géré dans Paramètres.
module.exports = simpleCrudRouter({
  table: 'zones_commerciales',
  columns: ['code', 'nom', 'actif'],
  orderBy: 'nom',
  subModuleKey: 'commerce.parametres',
});
