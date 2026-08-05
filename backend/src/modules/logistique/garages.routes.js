const { simpleCrudRouter } = require('../referentials/crud.factory');

// Garages partenaires (référentiel). Rattaché au sous-module maintenance.
module.exports = simpleCrudRouter({
  table: 'garages',
  columns: ['nom', 'ville', 'sous_contrat', 'specialites', 'efficacite_pct', 'telephone', 'notes', 'actif'],
  orderBy: 'nom',
  subModuleKey: 'logistique.maintenance',
});
