const { simpleCrudRouter } = require('./crud.factory');

module.exports = simpleCrudRouter({
  table: 'product_categories',
  columns: ['code', 'nom'],
  orderBy: 'nom',
  subModuleKey: 'referentiels.product_categories',
});
