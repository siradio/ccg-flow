const { simpleCrudRouter } = require('./crud.factory');

module.exports = simpleCrudRouter({
  table: 'business_units',
  columns: ['code', 'nom'],
  orderBy: 'nom',
  moduleKey: 'ref_business_units',
});
