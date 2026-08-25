const { simpleCrudRouter } = require('../referentials/crud.factory');

// Banques — référentiel minimal, utilisé par les versements bancaires (Phase F). Géré dans Paramètres.
module.exports = simpleCrudRouter({
  table: 'banks',
  columns: ['code', 'nom', 'actif'],
  orderBy: 'nom',
  subModuleKey: 'commerce.parametres',
});
