// Refonte Stock (Lot 0) — Référentiel des types de mouvement (CRUD générique).
// La factory gère déjà requireAuth (lecture) et requireSubModuleWrite (écriture par niveau).
const { simpleCrudRouter } = require('../referentials/crud.factory');

module.exports = simpleCrudRouter({
  table: 'stock_movement_types',
  columns: ['code', 'libelle', 'sens', 'requiert_validation', 'requiert_justificatif', 'actif', 'ordre'],
  orderBy: 'ordre, libelle',
  subModuleKey: 'stock.referentiels',
});
