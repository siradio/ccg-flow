import { useEffect, useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasModule } from '../../auth/AuthContext';
import ReferentialPage from './ReferentialPage';

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
    title: 'Entités du groupe', endpoint: '/entities', moduleKey: 'ref_entities',
    fields: [
      { key: 'code', label: 'Code', type: 'select', options: ['CCG', 'SOGUIPAL', 'PBIC'], required: true },
      { key: 'nom', label: 'Nom', required: true },
    ],
  },
  sites: {
    title: 'Sites', endpoint: '/sites', moduleKey: 'ref_sites',
    fields: [
      { key: 'entity_id', label: 'Entité', type: 'entitySelect', required: true },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'ville', label: 'Ville' },
      { key: 'adresse', label: 'Adresse' },
    ],
  },
  warehouses: {
    title: 'Entrepôts', endpoint: '/warehouses', moduleKey: 'ref_warehouses',
    fields: [
      { key: 'site_id', label: 'Site', type: 'siteSelect', required: true },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'code', label: 'Code' },
    ],
  },
  machines: {
    title: 'Machines de production', endpoint: '/machines', moduleKey: 'ref_machines',
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
    title: 'Catégories de produits', endpoint: '/product-categories', moduleKey: 'ref_product_categories',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'nom', label: 'Nom', required: true },
    ],
  },
  businessUnits: {
    title: 'Business Units', endpoint: '/business-units', moduleKey: 'ref_business_units',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'nom', label: 'Nom', required: true },
    ],
  },
  products: {
    title: 'Produits', endpoint: '/products', moduleKey: 'ref_products',
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
    title: 'Fournisseurs', endpoint: '/suppliers', moduleKey: 'ref_suppliers',
    fields: SUPPLIER_FIELDS,
  },
};

const NAV = [
  ['entities', 'Entités'], ['sites', 'Sites'], ['warehouses', 'Entrepôts'], ['machines', 'Machines'],
  ['products', 'Produits'], ['productCategories', 'Catégories de produits'],
  ['businessUnits', 'Business Units'], ['suppliers', 'Fournisseurs'],
];

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

  const allowedNav = NAV.filter(([key]) => hasModule(user, CONFIGS[key].moduleKey));

  if (allowedNav.length === 0) return <p>Aucun référentiel ne vous a été accordé.</p>;

  const config = CONFIGS[type];
  const canAccessCurrent = config && hasModule(user, config.moduleKey);
  if (!canAccessCurrent) return <Navigate to={`/referentials/${allowedNav[0][0]}`} replace />;

  return (
    <div>
      <nav className="subnav">
        {allowedNav.map(([key, label]) => (
          <NavLink key={key} to={`/referentials/${key}`} className={({ isActive }) => isActive ? 'active' : undefined}>{label}</NavLink>
        ))}
      </nav>
      <ReferentialPage
        key={type} title={config.title} endpoint={config.endpoint} fields={config.fields}
        entities={entities} sites={sites} lists={{ categories, businessUnits }}
        canWrite={hasModule(user, config.moduleKey)}
      />
    </div>
  );
}
