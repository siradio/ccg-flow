import { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import client from '../../api/client';
import ReferentialPage from './ReferentialPage';

const CONFIGS = {
  entities: {
    title: 'Entités du groupe', endpoint: '/entities',
    fields: [
      { key: 'code', label: 'Code', type: 'select', options: ['CCG', 'SOGUIPAL', 'PBIC'], required: true },
      { key: 'nom', label: 'Nom', required: true },
    ],
  },
  sites: {
    title: 'Sites', endpoint: '/sites',
    fields: [
      { key: 'entity_id', label: 'Entité', type: 'entitySelect', required: true },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'ville', label: 'Ville' },
      { key: 'adresse', label: 'Adresse' },
    ],
  },
  warehouses: {
    title: 'Entrepôts', endpoint: '/warehouses',
    fields: [
      { key: 'site_id', label: 'Site', type: 'siteSelect', required: true },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'code', label: 'Code' },
    ],
  },
  machines: {
    title: 'Machines de production', endpoint: '/machines',
    fields: [
      { key: 'site_id', label: 'Site', type: 'siteSelect', required: true },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'reference', label: 'Référence' },
      { key: 'categorie', label: 'Catégorie' },
    ],
  },
  employees: {
    title: 'Employés', endpoint: '/employees',
    fields: [
      { key: 'entity_id', label: 'Entité', type: 'entitySelect', required: true },
      { key: 'matricule', label: 'Matricule' },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'prenom', label: 'Prénom', required: true },
      { key: 'poste', label: 'Poste' },
      { key: 'service', label: 'Service' },
    ],
  },
  productCategories: {
    title: 'Catégories de produits', endpoint: '/product-categories',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'nom', label: 'Nom', required: true },
    ],
  },
  businessUnits: {
    title: 'Business Units', endpoint: '/business-units',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'nom', label: 'Nom', required: true },
    ],
  },
  products: {
    title: 'Produits', endpoint: '/products',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'designation', label: 'Désignation', required: true },
      { key: 'category_id', label: 'Catégorie', type: 'fkSelect', listKey: 'categories', required: true },
      { key: 'business_unit_id', label: 'Business Unit', type: 'fkSelect', listKey: 'businessUnits' },
      { key: 'unite', label: 'Unité' },
      { key: 'entity_ids', label: 'Entités', type: 'multiEntity' },
    ],
  },
  suppliers: {
    title: 'Fournisseurs', endpoint: '/suppliers',
    fields: [
      { key: 'nom', label: 'Nom', required: true },
      { key: 'contact_nom', label: 'Contact' },
      { key: 'contact_email', label: 'Email' },
      { key: 'contact_tel', label: 'Téléphone' },
      { key: 'entity_ids', label: 'Entités', type: 'multiEntity' },
    ],
  },
};

const NAV = [
  ['entities', 'Entités'], ['sites', 'Sites'], ['warehouses', 'Entrepôts'], ['machines', 'Machines'],
  ['employees', 'Employés'], ['products', 'Produits'], ['productCategories', 'Catégories de produits'],
  ['businessUnits', 'Business Units'], ['suppliers', 'Fournisseurs'],
];

export default function ReferentialsIndex() {
  const { type } = useParams();
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

  const config = CONFIGS[type] || CONFIGS.sites;

  return (
    <div>
      <nav className="subnav">
        {NAV.map(([key, label]) => (
          <NavLink key={key} to={`/referentials/${key}`} className={({ isActive }) => isActive ? 'active' : undefined}>{label}</NavLink>
        ))}
      </nav>
      <ReferentialPage
        key={type} title={config.title} endpoint={config.endpoint} fields={config.fields}
        entities={entities} sites={sites} lists={{ categories, businessUnits }}
      />
    </div>
  );
}
