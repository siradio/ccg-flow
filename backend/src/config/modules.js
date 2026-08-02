// Catalogue des modules/sous-modules auxquels un utilisateur peut se voir accorder l'accès
// (couche indépendante des rôles métier du workflow Achat — voir SPEC.md §2.3). Source de vérité
// unique : le frontend ne redéclare jamais cette liste (voir AuthContext.jsx/Users.jsx).
//
// Règle : un module avec `subModules` vide EST lui-même l'unité accordable (sa `key` sert
// directement de `sub_module_key`) ; un module avec des sous-modules n'est JAMAIS directement
// accordable, seuls ses sous-modules le sont. Ajouter un futur module (Logistique, QHSE,
// Commercial, Immobilisations, Production...) = ajouter une entrée ici + câbler ses routes sur
// requireSubModule(...) dans permissions.js — aucun autre changement structurel nécessaire.
const MODULES = [
  { key: 'achats', label: "Demandes d'achat", subModules: [] },
  {
    key: 'stock', label: 'Stock',
    subModules: [
      { key: 'stock.saisie_jour', label: 'Stock du Jour' },
      { key: 'stock.mouvements', label: 'Mouvement Stock' },
    ],
  },
  { key: 'kpi', label: 'KPI (Achats + RH)', subModules: [] },
  // Deviendra sous-modulé (Personnel / Congés & absences / Évaluation) quand ces écrans existeront
  // réellement — pas avant, pour ne pas exposer dans l'admin des cases à cocher menant à du vide.
  { key: 'rh', label: 'RH (Employés)', subModules: [] },
  {
    key: 'referentiels', label: 'Référentiels',
    subModules: [
      { key: 'referentiels.entities', label: 'Entités' },
      { key: 'referentiels.sites', label: 'Sites' },
      { key: 'referentiels.warehouses', label: 'Entrepôts' },
      { key: 'referentiels.machines', label: 'Machines' },
      { key: 'referentiels.products', label: 'Produits' },
      { key: 'referentiels.product_categories', label: 'Catégories de produits' },
      { key: 'referentiels.business_units', label: 'Business Units' },
      { key: 'referentiels.suppliers', label: 'Fournisseurs' },
      { key: 'referentiels.prix', label: 'Historique des prix' },
    ],
  },
];

// Liste à plat de toutes les clés réellement accordables (feuilles de l'arbre ci-dessus), pour
// validation côté API (voir users.routes.js).
function flattenSubModuleKeys(modules) {
  return modules.flatMap(m => (m.subModules.length ? m.subModules.map(sm => sm.key) : [m.key]));
}

const SUB_MODULE_KEYS = flattenSubModuleKeys(MODULES);

module.exports = { MODULES, SUB_MODULE_KEYS, flattenSubModuleKeys };
