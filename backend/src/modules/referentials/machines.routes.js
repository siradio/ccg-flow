const { simpleCrudRouter } = require('./crud.factory');

module.exports = simpleCrudRouter({
  table: 'machines',
  columns: [
    'site_id', 'nom', 'code', 'categorie', 'actif',
    'calendrier_travail', 'capacite', 'efficacite_pct',
    'temps_preparation_min', 'temps_nettoyage_min', 'cout_horaire', 'oee_cible_pct',
    'description',
  ],
  filterColumn: 'site_id',
  orderBy: 'nom',
  moduleKey: 'ref_machines',
});
