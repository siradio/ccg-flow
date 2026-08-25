import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from '../Referentials/ReferentialPage';
import CommerceSubnav, { firstCommerceTarget } from './CommerceSubnav';

// Module Commerce — Phase D. Réutilise la page CRUD générique des référentiels sous une sous-nav
// propre. Les commerciaux réutilisent le référentiel Employés (interne) et les BU/produits existants.
const fullEmp = e => `${e.matricule ? e.matricule + ' — ' : ''}${e.prenom || ''} ${e.nom || ''}`.trim();

const CONFIGS = {
  commerciaux: {
    title: 'Commerciaux', endpoint: '/commerce/commerciaux', subModuleKey: 'commerce.commerciaux',
    filters: ['business_unit_id', 'statut', 'type'],
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['interne', 'externe'], default: 'interne',
        optionLabels: { interne: 'Interne', externe: 'Externe' } },
      // Interne : on choisit un employé existant (l'identité vient du référentiel Employés).
      { key: 'employee_id', label: 'Employé (interne)', type: 'fkSelect', listKey: 'employees',
        showIf: { field: 'type', equals: 'interne' } },
      // Externe : coordonnées propres.
      { key: 'nom', label: 'Nom', showIf: { field: 'type', equals: 'externe' } },
      { key: 'prenom', label: 'Prénom', showIf: { field: 'type', equals: 'externe' } },
      { key: 'telephone', label: 'Téléphone', showIf: { field: 'type', equals: 'externe' } },
      { key: 'email', label: 'Email', showIf: { field: 'type', equals: 'externe' } },
      { key: 'adresse', label: 'Adresse', showIf: { field: 'type', equals: 'externe' } },
      { key: 'business_unit_id', label: 'Business Unit', type: 'fkSelect', listKey: 'businessUnits' },
      { key: 'zone_id', label: 'Zone', type: 'fkSelect', listKey: 'zones' },
      { key: 'responsable', label: 'Responsable' },
      { key: 'date_debut', label: "Date de début d'activité", type: 'date' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['actif', 'inactif'], default: 'actif',
        optionLabels: { actif: 'Actif', inactif: 'Inactif' } },
      { key: 'observations', label: 'Observations', type: 'textarea' },
    ],
  },
  affectations: {
    title: 'Affectations commerciales', endpoint: '/commerce/assignments', subModuleKey: 'commerce.commerciaux',
    filters: ['commercial_id', 'business_unit_id', 'actif'],
    fields: [
      { key: 'commercial_id', label: 'Commercial', type: 'fkSelect', listKey: 'commerciaux', required: true },
      { key: 'business_unit_id', label: 'Business Unit', type: 'fkSelect', listKey: 'businessUnits', required: true },
      { key: 'product_id', label: 'Produit (facultatif)', type: 'fkSelect', listKey: 'products' },
      { key: 'zone_id', label: 'Zone (facultatif)', type: 'fkSelect', listKey: 'zones' },
      { key: 'date_debut', label: 'Date de début', type: 'date' },
      { key: 'date_fin', label: 'Date de fin', type: 'date' },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
  moyens: {
    title: 'Moyens de versement', endpoint: '/commerce/payment-methods', subModuleKey: 'commerce.parametres',
    filters: ['actif'],
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'libelle', label: 'Libellé', required: true },
      { key: 'description', label: 'Description' },
      { key: 'requiert_reference', label: 'Référence obligatoire', type: 'checkbox' },
      { key: 'requiert_justificatif', label: 'Justificatif obligatoire', type: 'checkbox' },
      { key: 'ordre', label: 'Ordre', type: 'number' },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
  banques: {
    title: 'Banques', endpoint: '/commerce/banks', subModuleKey: 'commerce.parametres',
    filters: ['actif'],
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
  zones: {
    title: 'Zones commerciales', endpoint: '/commerce/zones', subModuleKey: 'commerce.parametres',
    filters: ['actif'],
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
};

export default function CommerceIndex() {
  const { type } = useParams();
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [zones, setZones] = useState([]);
  const [products, setProducts] = useState([]);
  const [commerciaux, setCommerciaux] = useState([]);

  useEffect(() => {
    client.get('/business-units/mine').then(r => setBusinessUnits(r.data)).catch(() => {});
    client.get('/commerce/zones').then(r => setZones(r.data.map(z => ({ id: z.id, nom: z.nom })))).catch(() => {});
    // Employés (pour les commerciaux internes) — dégradé gracieux sans accès RH (liste vide).
    client.get('/employees').then(r => setEmployees(r.data.map(e => ({ id: e.id, nom: fullEmp(e) })))).catch(() => {});
    client.get('/products').then(r => setProducts(r.data.map(p => ({ id: p.id, nom: p.designation })))).catch(() => {});
    client.get('/commerce/commerciaux').then(r => setCommerciaux(r.data.map(c => ({ id: c.id, nom: `${c.code} — ${c.prenom_affiche || ''} ${c.nom_affiche || ''}`.trim() })))).catch(() => {});
  }, []);

  const lists = useMemo(() => ({ employees, businessUnits, zones, products, commerciaux }),
    [employees, businessUnits, zones, products, commerciaux]);

  const config = CONFIGS[type];
  if (!config) {
    const target = firstCommerceTarget(user);
    return target ? <Navigate to={target} replace /> : <p style={{ padding: 16 }}>Accès Commerce non accordé.</p>;
  }
  if (!hasSubModuleLevel(user, config.subModuleKey)) {
    const target = firstCommerceTarget(user);
    return target ? <Navigate to={target} replace /> : <p style={{ padding: 16 }}>Accès non accordé.</p>;
  }

  return (
    <div>
      <CommerceSubnav />
      <ReferentialPage
        key={type} title={config.title} endpoint={config.endpoint} fields={config.fields}
        filters={config.filters || []}
        lists={lists}
        canAdd={hasSubModuleLevel(user, config.subModuleKey, 'ajout')}
        canEdit={hasSubModuleLevel(user, config.subModuleKey, 'edition')}
        rowLink={type === 'commerciaux' ? (item) => `/commerce/commerciaux/${item.id}` : null}
        rowLinkLabel="Fiche"
      />
    </div>
  );
}
