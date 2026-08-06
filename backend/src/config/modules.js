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
  // Cockpit (vue exécutive DG) — agrège stock, production, logistique, achats. Clé 'direction'
  // conservée (compat. des octrois existants) ; seul le libellé affiché devient « Cockpit ».
  { key: 'direction', label: 'Cockpit', subModules: [] },
  {
    key: 'stock', label: 'Stock',
    subModules: [
      // Nouveau module Stock (refonte — grand livre de mouvements). Voir feature/refonte-module-stock.
      { key: 'stock.tableau_bord', label: 'Tableau de bord Stock' },
      { key: 'stock.releve_jour', label: 'Relevé du jour (produits finis)' },
      { key: 'stock.saisie', label: 'Saisie des mouvements' },
      { key: 'stock.consultation', label: 'Consultation & stock actuel' },
      { key: 'stock.inventaires', label: 'Inventaires' },
      { key: 'stock.transferts', label: 'Transferts' },
      { key: 'stock.valorisation', label: 'Valorisation' },
      { key: 'stock.referentiels', label: 'Référentiels Stock' },
      { key: 'stock.import', label: 'Import des mouvements' },
    ],
  },
  {
    key: 'kpi', label: 'KPI',
    subModules: [
      { key: 'kpi.global', label: 'Vue globale (tous domaines)' },
      { key: 'kpi.achats', label: 'KPI Achats' },
      { key: 'kpi.rh', label: 'KPI RH' },
      { key: 'kpi.stock', label: 'KPI Stock' },
    ],
  },
  // Deviendra sous-modulé (Personnel / Congés & absences / Évaluation) quand ces écrans existeront
  // réellement — pas avant, pour ne pas exposer dans l'admin des cases à cocher menant à du vide.
  {
    key: 'logistique', label: 'Logistique',
    subModules: [
      { key: 'logistique.parc', label: 'Parc (véhicules)' },
      { key: 'logistique.missions', label: 'Missions' },
      { key: 'logistique.checklists', label: 'Checklists chauffeurs' },
      { key: 'logistique.maintenance', label: 'Pannes, garages & réparations' },
      { key: 'logistique.accidents', label: 'Accidents' },
      { key: 'logistique.suivi', label: 'Cartographie / suivi GPS' },
    ],
  },
  // Module Production — démarre avec le relevé de production journalière ; s'enrichira (planification,
  // ordres de fabrication, rendement, OEE…) au fur et à mesure de l'expression du besoin.
  {
    key: 'production', label: 'Production',
    subModules: [
      { key: 'production.releve', label: 'Relevé de production journalière' },
      { key: 'production.suivi', label: 'Suivi de production' },
    ],
  },
  { key: 'rh', label: 'RH (Employés)', subModules: [] },
  { key: 'liens', label: 'Liens utiles', subModules: [] },
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
