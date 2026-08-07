import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from './ReferentialPage';
import ReferentialsSubnav from './ReferentialsSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Exporté séparément pour être réutilisé tel quel par l'ajout rapide de fournisseur depuis une
// demande d'achat (DetailPage.jsx) — même structure, mêmes champs, entity_ids inclus, que le
// référentiel complet (la case de l'entité de la demande en cours est simplement pré-cochée).
export const SUPPLIER_FIELDS = [
  { key: 'nom', labelKey: 'refx.f.nom', required: true },
  { key: 'code', labelKey: 'refx.f.code' },
  { key: 'origine', labelKey: 'refx.f.origine', type: 'select', options: ['Import', 'Local'], optionNs: 'refx.origine' },
  { key: 'pays', labelKey: 'refx.f.pays' },
  { key: 'categorie', labelKey: 'refx.f.categorie' },
  { key: 'produits_offres', labelKey: 'refx.f.produits_offres' },
  { key: 'contact_nom', labelKey: 'refx.f.contact_nom' },
  { key: 'contact_email', labelKey: 'refx.f.contact_email' },
  { key: 'contact_tel', labelKey: 'refx.f.contact_tel' },
  { key: 'adresse', labelKey: 'refx.f.adresse' },
  { key: 'mode_paiement', labelKey: 'refx.f.mode_paiement' },
  { key: 'conditions_paiement', labelKey: 'refx.f.conditions_paiement' },
  { key: 'a_contrat', labelKey: 'refx.f.a_contrat', type: 'checkbox' },
  { key: 'actif', labelKey: 'refx.f.actif', type: 'checkbox', default: true },
  { key: 'commentaires', labelKey: 'refx.f.commentaires', type: 'textarea' },
  { key: 'entity_ids', labelKey: 'refx.f.entity_ids', type: 'multiEntity', defaultAll: true },
];

// Les libellés (`labelKey`, `titleKey`) et options (`optionNs`) sont des CLÉS i18n ; ReferentialPage
// les traduit (repli sur le libellé brut si absent). Les valeurs stockées (codes, slugs) ne changent pas.
const CONFIGS = {
  entities: {
    titleKey: 'refx.title.entities', endpoint: '/entities', subModuleKey: 'referentiels.entities',
    fields: [
      { key: 'code', labelKey: 'refx.f.code', type: 'select', options: ['CCG', 'SOGUIPAL', 'PBIC'], required: true },
      { key: 'nom', labelKey: 'refx.f.nom', required: true },
    ],
  },
  sites: {
    titleKey: 'refx.title.sites', endpoint: '/sites', subModuleKey: 'referentiels.sites',
    filters: ['entity_id'],
    fields: [
      { key: 'entity_id', labelKey: 'refx.f.entity_id', type: 'entitySelect', required: true },
      { key: 'nom', labelKey: 'refx.f.nom', required: true },
      { key: 'ville', labelKey: 'refx.f.ville' },
      { key: 'adresse', labelKey: 'refx.f.adresse' },
    ],
  },
  warehouses: {
    titleKey: 'refx.title.warehouses', endpoint: '/warehouses', subModuleKey: 'referentiels.warehouses',
    filters: ['site_id'],
    fields: [
      { key: 'site_id', labelKey: 'refx.f.site_id', type: 'siteSelect', required: true },
      { key: 'nom', labelKey: 'refx.f.nom', required: true },
      { key: 'code', labelKey: 'refx.f.code' },
    ],
  },
  machines: {
    titleKey: 'refx.title.machines', endpoint: '/machines', subModuleKey: 'referentiels.machines',
    filters: ['site_id', 'categorie', 'actif'],
    fields: [
      { key: 'site_id', labelKey: 'refx.f.site_id', type: 'siteSelect', required: true },
      { key: 'nom', labelKey: 'refx.f.nom', required: true },
      { key: 'code', labelKey: 'refx.f.code' },
      { key: 'categorie', labelKey: 'refx.f.categorie' },
      { key: 'calendrier_travail', labelKey: 'refx.f.calendrier_travail' },
      { key: 'capacite', labelKey: 'refx.f.capacite', type: 'number' },
      { key: 'efficacite_pct', labelKey: 'refx.f.efficacite_pct', type: 'number' },
      { key: 'temps_preparation_min', labelKey: 'refx.f.temps_preparation_min', type: 'number' },
      { key: 'temps_nettoyage_min', labelKey: 'refx.f.temps_nettoyage_min', type: 'number' },
      { key: 'cout_horaire', labelKey: 'refx.f.cout_horaire', type: 'number' },
      { key: 'oee_cible_pct', labelKey: 'refx.f.oee_cible_pct', type: 'number' },
      { key: 'date_fabrication', labelKey: 'refx.f.date_fabrication', type: 'date' },
      { key: 'date_acquisition', labelKey: 'refx.f.date_acquisition', type: 'date' },
      { key: 'actif', labelKey: 'refx.f.actif', type: 'checkbox', default: true },
      { key: 'description', labelKey: 'refx.f.description', type: 'textarea' },
      { key: 'photo', labelKey: 'refx.f.photo', type: 'photo' },
    ],
  },
  productCategories: {
    titleKey: 'refx.title.productCategories', endpoint: '/product-categories', subModuleKey: 'referentiels.product_categories',
    fields: [
      { key: 'code', labelKey: 'refx.f.code', required: true },
      { key: 'nom', labelKey: 'refx.f.nom', required: true },
    ],
  },
  businessUnits: {
    titleKey: 'refx.title.businessUnits', endpoint: '/business-units', subModuleKey: 'referentiels.business_units',
    fields: [
      { key: 'code', labelKey: 'refx.f.code', required: true },
      { key: 'nom', labelKey: 'refx.f.nom', required: true },
    ],
  },
  products: {
    titleKey: 'refx.title.products', endpoint: '/products', subModuleKey: 'referentiels.products',
    // Un seul référentiel gère produits finis, matières premières et consommables : la distinction
    // se fait par « Type d'article ». Les champs propres aux matières premières n'apparaissent que
    // lorsque ce type est « matière première » (showIf).
    filters: ['type_article', 'category_id', 'business_unit_id', 'entity_ids'],
    fields: [
      { key: 'type_article', labelKey: 'refx.f.type_article', type: 'select', options: ['produit_fini', 'matiere_premiere', 'consommable', 'autre'], optionNs: 'type', default: 'produit_fini' },
      { key: 'code', labelKey: 'refx.f.code' },
      { key: 'designation', labelKey: 'refx.f.designation', required: true },
      { key: 'code_barres', labelKey: 'refx.f.code_barres' },
      { key: 'category_id', labelKey: 'refx.f.category_id', type: 'fkSelect', listKey: 'categories', required: true },
      { key: 'sous_categorie', labelKey: 'refx.f.sous_categorie' },
      { key: 'marque', labelKey: 'refx.f.marque' },
      { key: 'business_unit_id', labelKey: 'refx.f.business_unit_id', type: 'fkSelect', listKey: 'businessUnits' },
      { key: 'unite', labelKey: 'refx.f.unite' },
      { key: 'unite_vente', labelKey: 'refx.f.unite_vente' },
      // Champs spécifiques matières premières (production / consommation).
      { key: 'unite_conso', labelKey: 'refx.f.unite_conso', showIf: { field: 'type_article', equals: 'matiere_premiere' } },
      { key: 'coef_conversion', labelKey: 'refx.f.coef_conversion', type: 'number', showIf: { field: 'type_article', equals: 'matiere_premiere' } },
      { key: 'fournisseur_principal_id', labelKey: 'refx.f.fournisseur_principal_id', type: 'fkSelect', listKey: 'suppliers', showIf: { field: 'type_article', equals: 'matiere_premiere' } },
      // Coûts & valorisation.
      { key: 'cout_standard', labelKey: 'refx.f.cout_standard', type: 'number' },
      { key: 'prix_vente_ht', labelKey: 'refx.f.prix_vente_ht', type: 'number' },
      { key: 'methode_valorisation', labelKey: 'refx.f.methode_valorisation', type: 'select', options: ['cmp', 'cout_standard', 'dernier_achat', 'fifo'], optionNs: 'refx.valo', default: 'cmp' },
      // Seuils & gestion.
      { key: 'seuil_alerte_stock', labelKey: 'refx.f.seuil_alerte_stock', type: 'number' },
      { key: 'stock_securite', labelKey: 'refx.f.stock_securite', type: 'number' },
      { key: 'seuil_max', labelKey: 'refx.f.seuil_max', type: 'number' },
      { key: 'delai_reappro_jours', labelKey: 'refx.f.delai_reappro_jours', type: 'number' },
      { key: 'gere_par_lot', labelKey: 'refx.f.gere_par_lot', type: 'checkbox' },
      { key: 'gere_peremption', labelKey: 'refx.f.gere_peremption', type: 'checkbox' },
      { key: 'duree_conservation_jours', labelKey: 'refx.f.duree_conservation_jours', type: 'number', showIf: { field: 'gere_peremption', equals: true } },
      { key: 'entity_ids', labelKey: 'refx.f.entity_ids', type: 'multiEntity' },
    ],
  },
  suppliers: {
    titleKey: 'refx.title.suppliers', endpoint: '/suppliers', subModuleKey: 'referentiels.suppliers',
    filters: ['origine', 'categorie', 'actif', 'entity_ids'],
    fields: SUPPLIER_FIELDS,
  },
};

const NAV = [
  ['entities', 'refx.nav.entities'], ['sites', 'refx.nav.sites'], ['warehouses', 'refx.nav.warehouses'], ['machines', 'refx.nav.machines'],
  ['products', 'refx.nav.products'], ['productCategories', 'refx.nav.productCategories'],
  ['businessUnits', 'refx.nav.businessUnits'], ['suppliers', 'refx.nav.suppliers'],
];

// Réutilisé par ReferentialsSubnav.jsx (partagé avec Employees/ListPage.jsx) pour construire la
// barre d'onglets sans dupliquer la liste des référentiels et leur sous-module. Le 2e élément est
// une CLÉ i18n de libellé d'onglet.
export const REFERENTIAL_NAV = NAV.map(([key, labelKey]) => [key, labelKey, CONFIGS[key].subModuleKey]);

export default function ReferentialsIndex() {
  const { type } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [entities, setEntities] = useState([]);
  const [sites, setSites] = useState([]);
  const [categories, setCategories] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/sites').then(res => setSites(res.data));
    client.get('/product-categories').then(res => setCategories(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
    client.get('/suppliers').then(res => setSuppliers(res.data)).catch(() => {});
  }, []);

  const allowedNav = NAV.filter(([key]) => hasSubModuleLevel(user, CONFIGS[key].subModuleKey));
  const showEmployeesTab = hasSubModuleLevel(user, 'rh');

  if (allowedNav.length === 0 && !showEmployeesTab) return <p>{t('refx.noneGranted')}</p>;

  const config = CONFIGS[type];
  const canAccessCurrent = config && hasSubModuleLevel(user, config.subModuleKey);
  if (!canAccessCurrent) {
    return <Navigate to={allowedNav.length > 0 ? `/referentials/${allowedNav[0][0]}` : '/employees'} replace />;
  }

  // Injecte les optionLabels traduits pour les selects porteurs d'un `optionNs` (les libellés de
  // champ sont traduits par ReferentialPage via `labelKey`).
  const tFields = config.fields.map(f => (f.optionNs && f.options
    ? { ...f, optionLabels: Object.fromEntries(f.options.map(o => [o, t(`${f.optionNs}.${o}`)])) }
    : f));

  return (
    <div>
      <ReferentialsSubnav />
      <ReferentialPage
        key={type} title={t(config.titleKey)} endpoint={config.endpoint} fields={tFields}
        filters={config.filters || []}
        entities={entities} sites={sites} lists={{ categories, businessUnits, suppliers }}
        canAdd={hasSubModuleLevel(user, config.subModuleKey, 'ajout')}
        canEdit={hasSubModuleLevel(user, config.subModuleKey, 'edition')}
      />
    </div>
  );
}
