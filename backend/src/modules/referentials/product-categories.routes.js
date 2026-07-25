const { simpleCrudRouter } = require('./crud.factory');

module.exports = simpleCrudRouter({
  table: 'product_categories',
  columns: ['code', 'nom'],
  orderBy: 'nom',
  moduleKey: 'ref_product_categories',
});
