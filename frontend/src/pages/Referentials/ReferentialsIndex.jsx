import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from './ReferentialPage';
import ReferentialsSubnav from './ReferentialsSubnav';

// Exporté séparément pour être réutilisé tel quel par l'ajout rapide de fournisseur depuis une
// demande d'achat (DetailPage.jsx) — même structure, mêmes champs, entity_ids inclus, que le
// référentiel complet (la case de l'entité de la demande en cours est simplement pré-cochée).
export const SUPPLIER_FIELDS = [
  { key: 'nom', label: 'Nom', required: true },
  { key: 'code', label: 'Code' },
  { key: 'origine', label: 'Origine', type: 'select', options: ['Import', 'Local'] },
  { key: 'pays', label: 'Pays' },
  { key: 'categorie', label: 'Catégorie' },
  { key: 'produits_offres', label: 'Produits / Offres' },
  { key: 'contact_nom', label: 'Contact' },
  { key: 'contact_email', label: 'Email' },
  { key: 'contact_tel', label: 'Téléphone' },
  { key: 'adresse', label: 'Adresse' },
  { key: 'mode_paiement', label: 'Mode de paiement' },
  { key: 'conditions_paiement', label: 'Conditions de paiement' },
  { key: 'a_contrat', label: 'Contrat en place', type: 'checkbox' },
  { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
  { key: 'commentaires', label: 'Commentaires', type: 'textarea' },
  { key: 'entity_ids', label: 'Entités', type: 'multiEntity' },
];

const CONFIGS = {
  entities: {
    title: 'Entités du groupe', endpoint: '/entities', subModuleKey: 'referentiels.entities',
    fields: [
      { key: 'code', label: 'Code', type: 'select', options: ['CCG', 'SOGUIPAL', 'PBIC'], required: true },
      { key: 'nom', label: 'Nom', required: true },
    ],
  },
  sites: {
    title: 'Sites', endpoint: '/sites', subModuleKey: 'referentiels.sites',
    filters: ['entity_id'],
    fields: [
      { key: 'entity_id', label: 'Entité', type: 'entitySelect', required: true },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'ville', label: 'Ville' },
      { key: 'adresse', label: 'Adresse' },
    ],
  },
  warehouses: {
    title: 'Entrepôts', endpoint: '/warehouses', subModuleKey: 'referentiels.warehouses',
    filters: ['site_id'],
    fields: [
      { key: 'site_id', label: 'Site', type: 'siteSelect', required: true },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'code', label: 'Code' },
    ],
  },
  machines: {
    title: 'Machines de production', endpoint: '/machines', subModuleKey: 'referentiels.machines',
    filters: ['site_id', 'categorie', 'actif'],
    fields: [
      { key: 'site_id', label: 'Site', type: 'siteSelect', required: true },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'code', label: 'Code' },
      { key: 'categorie', label: 'Catégorie' },
      { key: 'calendrier_travail', label: 'Calendrier de travail' },
      { key: 'capacite', label: 'Capacité', type: 'number' },
      { key: 'efficacite_pct', label: 'Efficacité (%)', type: 'number' },
      { key: 'temps_preparation_min', label: 'Temps de préparation (min)', type: 'number' },
      { key: 'temps_nettoyage_min', label: 'Temps de nettoyage (min)', type: 'number' },
      { key: 'cout_horaire', label: 'Coût par heure', type: 'number' },
      { key: 'oee_cible_pct', label: 'OEE cible (%)', type: 'number' },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  productCategories: {
    title: 'Catégories de produits', endpoint: '/product-categories', subModuleKey: 'referentiels.product_categories',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'nom', label: 'Nom', required: true },
    ],
  },
  businessUnits: {
    title: 'Business Units', endpoint: '/business-units', subModuleKey: 'referentiels.business_units',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'nom', label: 'Nom', required: true },
    ],
  },
  products: {
    title: 'Produits', endpoint: '/products', subModuleKey: 'referentiels.products',
    // "Catégorie" (produit fini / matière première / consommable…) tient lieu de type de produit :
    // c'est l'axe de classification demandé, filtrable directement ici.
    filters: ['category_id', 'business_unit_id', 'entity_ids'],
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'designation', label: 'Désignation', required: true },
      { key: 'category_id', label: 'Catégorie', type: 'fkSelect', listKey: 'categories', required: true },
      { key: 'business_unit_id', label: 'Business Unit', type: 'fkSelect', listKey: 'businessUnits' },
      { key: 'unite', label: 'Unité' },
      { key: 'seuil_alerte_stock', label: 'Seuil d\'alerte stock', type: 'number' },
      { key: 'entity_ids', label: 'Entités', type: 'multiEntity' },
    ],
  },
  suppliers: {
    title: 'Fournisseurs', endpoint: '/suppliers', subModuleKey: 'referentiels.suppliers',
    filters: ['origine', 'categorie', 'actif', 'entity_ids'],
    fields: SUPPLIER_FIELDS,
  },
};

const NAV = [
  ['entities', 'Entités'], ['sites', 'Sites'], ['warehouses', 'Entrepôts'], ['machines', 'Machines'],
  ['products', 'Produits'], ['productCategories', 'Catégories de produits'],
  ['businessUnits', 'Business Units'], ['suppliers', 'Fournisseurs'],
];

// Réutilisé par ReferentialsSubnav.jsx (partagé avec Employees/ListPage.jsx) pour construire la
// barre d'onglets sans dupliquer la liste des référentiels et leur sous-module.
export const REFERENTIAL_NAV = NAV.map(([key, label]) => [key, label, CONFIGS[key].subModuleKey]);

export default function ReferentialsIndex() {
  const { type } = useParams();
  const { user } = useAuth();
  const [entities, setEntities] = useState([]);
  const [sites, setSites] = useState([]);
  const [categories, setCategories] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);

  useEffect(() => {
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/sites').then(res => setSites(res.data));
    client.get('/product-categories').then(res => setCategories(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
  }, []);

  const allowedNav = NAV.filter(([key]) => hasSubModuleLevel(user, CONFIGS[key].subModuleKey));
  const showEmployeesTab = hasSubModuleLevel(user, 'rh');

  if (allowedNav.length === 0 && !showEmployeesTab) return <p>Aucun référentiel ne vous a été accordé.</p>;

  const config = CONFIGS[type];
  const canAccessCurrent = config && hasSubModuleLevel(user, config.subModuleKey);
  if (!canAccessCurrent) {
    return <Navigate to={allowedNav.length > 0 ? `/referentials/${allowedNav[0][0]}` : '/employees'} replace />;
  }

  return (
    <div>
      <ReferentialsSubnav />
      <ReferentialPage
        key={type} title={config.title} endpoint={config.endpoint} fields={config.fields}
        filters={config.filters || []}
        entities={entities} sites={sites} lists={{ categories, businessUnits }}
        canAdd={hasSubModuleLevel(user, config.subModuleKey, 'ajout')}
        canEdit={hasSubModuleLevel(user, config.subModuleKey, 'edition')}
      />
    </div>
  );
}
