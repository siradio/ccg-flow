import { useEffect, useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from '../Referentials/ReferentialPage';

// Module Logistique — socle « Parc ». Réutilise la page CRUD générique des référentiels (mêmes
// composants, mêmes permissions par sous-module), sous une sous-navigation propre au module. Les
// écrans suivants (Conducteurs, Missions, Checklists…) viendront s'ajouter au fil des phases.
const STATUTS = ['actif', 'immobilise', 'reforme'];

const CONFIGS = {
  vehicules: {
    title: 'Parc — véhicules', endpoint: '/vehicles', subModuleKey: 'logistique.parc',
    filters: ['type_id', 'statut'],
    fields: [
      { key: 'immatriculation', label: 'Immatriculation', required: true },
      { key: 'type_id', label: 'Type', type: 'fkSelect', listKey: 'vehicleTypes' },
      { key: 'marque', label: 'Marque' },
      { key: 'modele', label: 'Modèle' },
      { key: 'annee', label: 'Année', type: 'number' },
      { key: 'entity_id', label: 'Entité (facultatif)', type: 'fkSelect', listKey: 'entities' },
      { key: 'site_id', label: 'Site', type: 'fkSelect', listKey: 'sites' },
      { key: 'statut', label: 'Statut', type: 'select', options: STATUTS, default: 'actif' },
      { key: 'compteur_km', label: 'Compteur (km)', type: 'number' },
      { key: 'date_mise_circulation', label: 'Mise en circulation', type: 'date' },
      { key: 'date_acquisition', label: "Date d'acquisition", type: 'date' },
      { key: 'photo', label: 'Photo', type: 'photo' },
    ],
  },
  conducteurs: {
    title: 'Conducteurs', endpoint: '/drivers', subModuleKey: 'logistique.parc',
    filters: ['actif'],
    // Chauffeur interne : on choisit l'employé → nom/prénom/téléphone se remplissent tout seuls
    // (modifiables). Chauffeur externe/intérimaire : on laisse « Employé » vide et on saisit le nom.
    fields: [
      { key: 'employee_id', label: 'Employé (chauffeur interne)', type: 'fkSelect', listKey: 'employees',
        autofill: { nom: '_nom', prenom: '_prenom', telephone: '_tel' } },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'prenom', label: 'Prénom' },
      { key: 'telephone', label: 'Téléphone' },
      { key: 'permis_numero', label: 'N° de permis' },
      { key: 'permis_categories', label: 'Catégories de permis' },
      { key: 'permis_validite', label: 'Validité du permis', type: 'date' },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
  types: {
    title: 'Types de véhicule', endpoint: '/vehicle-types', subModuleKey: 'logistique.parc',
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'nom', label: 'Nom', required: true },
    ],
  },
};

const NAV = [['vehicules', 'Véhicules'], ['conducteurs', 'Conducteurs'], ['types', 'Types de véhicule']];

export default function LogistiqueIndex() {
  const { type } = useParams();
  const { user } = useAuth();
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [entities, setEntities] = useState([]);
  const [sites, setSites] = useState([]);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    client.get('/vehicle-types').then(res => setVehicleTypes(res.data)).catch(() => {});
    client.get('/entities').then(res => setEntities(res.data)).catch(() => {});
    client.get('/sites').then(res => setSites(res.data)).catch(() => {});
    // Liste des employés pour lier un conducteur interne à sa fiche RH. En dégradé gracieux si
    // l'utilisateur n'a pas l'accès RH : le lien reste vide, on saisit alors nom/prénom à la main.
    client.get('/employees').then(res => setEmployees(res.data.map(e => ({
      id: e.id,
      nom: `${e.prenom || ''} ${e.nom || ''}`.trim(),   // libellé de l'option
      _nom: e.nom || '', _prenom: e.prenom || '', _tel: e.telephone || '', // sources d'auto-remplissage
    })))).catch(() => {});
  }, []);

  const canParc = hasSubModuleLevel(user, 'logistique.parc');
  if (!canParc) return <p>Le module Logistique ne vous a pas été accordé.</p>;

  const config = CONFIGS[type];
  if (!config) return <Navigate to="/logistique/vehicules" replace />;

  return (
    <div>
      <nav className="subnav">
        {NAV.map(([key, label]) => (
          <NavLink key={key} to={`/logistique/${key}`} className={({ isActive }) => isActive ? 'active' : undefined}>{label}</NavLink>
        ))}
      </nav>
      <ReferentialPage
        key={type} title={config.title} endpoint={config.endpoint} fields={config.fields}
        filters={config.filters || []}
        entities={entities} sites={sites} lists={{ vehicleTypes, entities, sites, employees }}
        canAdd={hasSubModuleLevel(user, config.subModuleKey, 'ajout')}
        canEdit={hasSubModuleLevel(user, config.subModuleKey, 'edition')}
      />
    </div>
  );
}
