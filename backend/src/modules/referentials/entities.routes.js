const { simpleCrudRouter } = require('./crud.factory');

module.exports = simpleCrudRouter({
  table: 'entities',
  columns: ['code', 'nom'],
  orderBy: 'nom',
  moduleKey: 'ref_entities',
});
