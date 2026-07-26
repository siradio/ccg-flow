// Catalogue des modules/fonctionnalités auxquels un utilisateur peut se voir accorder
// l'accès (couche indépendante des rôles métier du workflow Achat — voir SPEC.md §2.3).
const MODULES = [
  { key: 'achats', label: "Demandes d'achat" },
  { key: 'rh', label: 'RH (Employés)' },
  { key: 'kpi', label: 'KPI (Achats + RH)' },
  { key: 'stock', label: 'Stock' },
  { key: 'prix', label: 'Historique des prix' },
  { key: 'ref_entities', label: 'Référentiel : Entités' },
  { key: 'ref_sites', label: 'Référentiel : Sites' },
  { key: 'ref_warehouses', label: 'Référentiel : Entrepôts' },
  { key: 'ref_machines', label: 'Référentiel : Machines' },
  { key: 'ref_products', label: 'Référentiel : Produits' },
  { key: 'ref_product_categories', label: 'Référentiel : Catégories de produits' },
  { key: 'ref_business_units', label: 'Référentiel : Business Units' },
  { key: 'ref_suppliers', label: 'Référentiel : Fournisseurs' },
];

const MODULE_KEYS = MODULES.map(m => m.key);

module.exports = { MODULES, MODULE_KEYS };
