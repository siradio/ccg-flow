const { simpleCrudRouter } = require('./crud.factory');

module.exports = simpleCrudRouter({
  table: 'business_units',
  columns: ['code', 'nom'],
  orderBy: 'nom',
  subModuleKey: 'referentiels.business_units',
});
