// Catalogue des modules/fonctionnalités auxquels un utilisateur peut se voir accorder
// l'accès (couche indépendante des rôles métier du workflow Achat — voir SPEC.md §2.3).
// "stock" est réservé pour le futur module de gestion des stocks : la clé existe déjà
// pour ne pas retoucher l'architecture d'accès quand ce module sera construit.
const MODULES = [
  { key: 'achats', label: "Demandes d'achat" },
  { key: 'rh', label: 'RH (Employés)' },
  { key: 'stock', label: 'Stock (à venir)' },
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
