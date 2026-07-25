const { simpleCrudRouter } = require('./crud.factory');

module.exports = simpleCrudRouter({
  table: 'sites',
  columns: ['entity_id', 'nom', 'adresse', 'ville'],
  filterColumn: 'entity_id',
  orderBy: 'nom',
  moduleKey: 'ref_sites',
});
