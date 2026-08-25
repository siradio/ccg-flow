// Miroir léger du catalogue backend (backend/src/config/modules.js) — seule la structure (quelles
// clés de sous-module existent sous quel module) est nécessaire côté frontend, pour dériver la
// visibilité des liens de navigation (voir hasModuleAccess dans AuthContext.jsx). Le catalogue
// complet avec labels est chargé depuis GET /users/sub-module-catalog pour l'écran
// Admin > Utilisateurs uniquement (réservé au super_admin côté API).
//
// Un module absent d'ici, ou présent avec un tableau vide, est lui-même l'unité accordable (sa
// clé sert directement de sub_module_key) — même règle que côté backend.
export const MODULE_SUB_KEYS = {
  stock: [
    'stock.tableau_bord', 'stock.releve_jour', 'stock.saisie', 'stock.consultation',
    'stock.inventaires', 'stock.transferts', 'stock.valorisation', 'stock.referentiels', 'stock.import',
  ],
  logistique: [
    'logistique.parc', 'logistique.missions', 'logistique.checklists',
    'logistique.maintenance', 'logistique.accidents', 'logistique.suivi',
  ],
  production: ['production.releve', 'production.suivi'],
  commerce: [
    'commerce.tableau_bord', 'commerce.versements', 'commerce.objectifs',
    'commerce.commerciaux', 'commerce.commissions', 'commerce.rapports', 'commerce.parametres',
  ],
  kpi: ['kpi.global', 'kpi.achats', 'kpi.rh', 'kpi.stock'],
  referentiels: [
    'referentiels.entities', 'referentiels.sites', 'referentiels.warehouses', 'referentiels.machines',
    'referentiels.products', 'referentiels.product_categories', 'referentiels.business_units', 'referentiels.suppliers',
    'referentiels.prix',
  ],
};
