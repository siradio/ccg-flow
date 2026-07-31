const { simpleCrudRouter } = require('./crud.factory');

module.exports = simpleCrudRouter({
  table: 'warehouses',
  columns: ['site_id', 'nom', 'code'],
  filterColumn: 'site_id',
  orderBy: 'nom',
  subModuleKey: 'referentiels.warehouses',
});
