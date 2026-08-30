import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from '../Referentials/ReferentialPage';
import LogistiqueSubnav from './LogistiqueSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Espace de noms i18n des options de select par (type de config, champ) — le champ `statut` existe
// sur deux configs avec des jeux d'options différents, d'où la désambiguïsation par type.
const OPT_NS = {
  vehicules: { statut: 'log.vehStatut' },
  missions: { statut: 'log.missionStatut' },
  conducteurs: { type_conducteur: 'log.condType' },
};

// Module Logistique. Réutilise la page CRUD générique des référentiels (mêmes composants, mêmes
// permissions par sous-module), sous une sous-navigation propre au module.
const STATUTS = ['Disponible', 'En mission', 'Maintenance', 'Immobilisé', 'Réformé'];
const MISSION_STATUTS = ['Planifiée', 'En cours', 'Terminée', 'Annulée'];
const fullName = e => `${e.prenom || ''} ${e.nom || ''}`.trim();

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
      { key: 'statut', label: 'Statut', type: 'select', options: STATUTS, default: 'Disponible' },
      { key: 'compteur_km', label: 'Compteur (km)', type: 'number' },
      { key: 'capacite_reservoir', label: 'Capacité réservoir (L)', type: 'number' },
      { key: 'date_mise_circulation', label: 'Mise en circulation', type: 'date' },
      { key: 'date_acquisition', label: "Date d'acquisition", type: 'date' },
      { key: 'photo', label: 'Photo', type: 'photo' },
    ],
  },
  conducteurs: {
    title: 'Conducteurs', endpoint: '/drivers', subModuleKey: 'logistique.parc',
    filters: ['type_conducteur', 'actif'],
    // Type = dimension de stats (interne vs prestataire). Interne → on choisit l'employé (chauffeur)
    // et nom/prénom/téléphone se remplissent tout seuls. Prestataire → société + saisie manuelle.
    fields: [
      { key: 'type_conducteur', label: 'Type de conducteur', type: 'select', options: ['Interne', 'Prestataire'], default: 'Interne' },
      { key: 'employee_id', label: 'Employé (chauffeur interne)', type: 'fkSelect', listKey: 'employees',
        autofill: { nom: '_nom', prenom: '_prenom', telephone: '_tel' },
        showIf: { field: 'type_conducteur', equals: 'Interne' } },
      { key: 'societe', label: 'Société (prestataire)', showIf: { field: 'type_conducteur', equals: 'Prestataire' } },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'prenom', label: 'Prénom' },
      { key: 'telephone', label: 'Téléphone' },
      { key: 'permis_numero', label: 'N° de permis' },
      { key: 'permis_categories', label: 'Catégories de permis' },
      { key: 'permis_validite', label: 'Validité du permis', type: 'date' },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
  missions: {
    title: 'Missions', endpoint: '/missions', subModuleKey: 'logistique.missions',
    filters: ['statut', 'vehicle_id'], duplicable: true,  // missions récurrentes : « Dupliquer »
    fields: [
      { key: 'objet', label: 'Objet / motif', required: true },
      { key: 'vehicle_id', label: 'Véhicule', type: 'fkSelect', listKey: 'vehicles', required: true },
      { key: 'driver_id', label: 'Chauffeur', type: 'fkSelect', listKey: 'drivers', required: true },
      { key: 'commercial_employee_id', label: 'Commercial (accompagnateur)', type: 'fkSelect', listKey: 'commerciaux' },
      { key: 'depart', label: 'Départ' },
      { key: 'arrivee', label: 'Arrivée / destination' },
      { key: 'date_debut', label: 'Date de début', type: 'date' },
      { key: 'date_fin', label: 'Date de fin', type: 'date' },
      { key: 'km_depart', label: 'Km départ', type: 'number' },
      { key: 'km_retour', label: 'Km retour', type: 'number' },
      { key: 'statut', label: 'Statut', type: 'select', options: MISSION_STATUTS, default: 'Planifiée' },
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

export default function LogistiqueIndex() {
  const { type } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [entities, setEntities] = useState([]);
  const [sites, setSites] = useState([]);
  const [rawEmployees, setRawEmployees] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    client.get('/vehicle-types').then(res => setVehicleTypes(res.data)).catch(() => {});
    client.get('/entities').then(res => setEntities(res.data)).catch(() => {});
    client.get('/sites').then(res => setSites(res.data)).catch(() => {});
    // Employés une seule fois → on en dérive les chauffeurs et les commerciaux. Dégradé gracieux
    // sans accès RH (listes vides). Véhicules/conducteurs pour les listes déroulantes des missions.
    client.get('/employees').then(res => setRawEmployees(res.data)).catch(() => {});
    client.get('/vehicles').then(res => setVehicles(res.data.map(v => ({ id: v.id, nom: `${v.immatriculation}${v.marque ? ' — ' + v.marque : ''}` })))).catch(() => {});
    client.get('/drivers').then(res => setDrivers(res.data.map(d => ({ id: d.id, nom: fullName(d) })))).catch(() => {});
  }, []);

  // Chauffeurs (pour lier un conducteur interne) et commerciaux (accompagnateur de mission), filtrés
  // sur le poste, avec les sources d'auto-remplissage pour les chauffeurs.
  const chauffeurs = useMemo(() => rawEmployees.filter(e => /chauffeur/i.test(e.poste || ''))
    .map(e => ({ id: e.id, nom: fullName(e), _nom: e.nom || '', _prenom: e.prenom || '', _tel: e.telephone || '' })), [rawEmployees]);
  const commerciaux = useMemo(() => rawEmployees.filter(e => /commercial/i.test(e.poste || ''))
    .map(e => ({ id: e.id, nom: fullName(e) })), [rawEmployees]);

  const config = CONFIGS[type];
  if (!config) return <Navigate to="/logistique/vehicules" replace />;
  if (!hasSubModuleLevel(user, config.subModuleKey)) {
    return <p>{t('log.notGranted')}</p>;
  }

  // Traduction à la volée : titre + libellés de champ (via `log.f.<key>`) + libellés d'options de
  // select (via OPT_NS). Les valeurs stockées restent inchangées ; seule leur restitution est traduite.
  const tFields = config.fields.map(f => {
    const ns = OPT_NS[type]?.[f.key];
    return {
      ...f,
      label: t(`log.f.${f.key}`),
      ...(ns && f.options ? { optionLabels: Object.fromEntries(f.options.map(o => [o, t(`${ns}.${o}`)])) } : {}),
    };
  });

  return (
    <div>
      <LogistiqueSubnav />
      <ReferentialPage
        key={type} title={t(`log.title.${type}`)} endpoint={config.endpoint} fields={tFields}
        filters={config.filters || []}
        entities={entities} sites={sites}
        lists={{ vehicleTypes, entities, sites, employees: chauffeurs, vehicles, drivers, commerciaux }}
        canAdd={hasSubModuleLevel(user, config.subModuleKey, 'ajout')}
        canEdit={hasSubModuleLevel(user, config.subModuleKey, 'edition')}
        duplicable={config.duplicable}
      />
    </div>
  );
}
