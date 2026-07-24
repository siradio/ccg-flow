const { simpleCrudRouter } = require('./crud.factory');

module.exports = simpleCrudRouter({
  table: 'machines',
  columns: ['site_id', 'nom', 'reference', 'categorie'],
  filterColumn: 'site_id',
  orderBy: 'nom',
});
