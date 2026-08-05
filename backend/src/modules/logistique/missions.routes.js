const { simpleCrudRouter } = require('../referentials/crud.factory');

// Missions (déplacements) — sous-module logistique.missions. Véhicule + chauffeur obligatoires,
// commercial accompagnateur facultatif.
module.exports = simpleCrudRouter({
  table: 'missions',
  columns: [
    'objet', 'vehicle_id', 'driver_id', 'commercial_employee_id',
    'depart', 'arrivee', 'date_debut', 'date_fin', 'km_depart', 'km_retour', 'statut',
  ],
  filterColumn: 'vehicle_id',
  orderBy: 'date_debut DESC NULLS LAST, id DESC',
  subModuleKey: 'logistique.missions',
});
