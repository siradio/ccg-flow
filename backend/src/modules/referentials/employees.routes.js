const { simpleCrudRouter } = require('./crud.factory');

module.exports = simpleCrudRouter({
  table: 'employees',
  columns: ['matricule', 'nom', 'prenom', 'poste', 'service', 'entity_id', 'site_id', 'actif'],
  filterColumn: 'entity_id',
  orderBy: 'nom',
});
