// Refonte Stock (Lot 0) — Référentiel des localisations de stock (entrepôt/magasin/zone/transit),
// rattachement optionnel à site/entité/BU. CRUD générique.
const { simpleCrudRouter } = require('../referentials/crud.factory');

module.exports = simpleCrudRouter({
  table: 'stock_locations',
  columns: ['code', 'nom', 'type', 'parent_id', 'site_id', 'entity_id', 'business_unit_id', 'actif'],
  orderBy: 'nom',
  subModuleKey: 'stock.referentiels',
});
