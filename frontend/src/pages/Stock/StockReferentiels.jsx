import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from '../Referentials/ReferentialPage';
import StockSectionNav from './StockSectionNav';

// Refonte Stock (Lot 0) — Référentiels du module Stock : types de mouvement + localisations.
// Réutilise le composant générique ReferentialPage. Gaté par le sous-module stock.referentiels.
const CONFIGS = {
  movementTypes: {
    title: 'Types de mouvement', endpoint: '/stock-movement-types', subModuleKey: 'stock.referentiels',
    filters: ['sens', 'actif'],
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'libelle', label: 'Libellé', required: true },
      { key: 'sens', label: 'Sens (impact stock)', type: 'select', options: ['entree', 'sortie', 'neutre'], required: true },
      { key: 'requiert_validation', label: 'Nécessite une validation', type: 'checkbox' },
      { key: 'requiert_justificatif', label: 'Nécessite un justificatif', type: 'checkbox' },
      { key: 'ordre', label: 'Ordre d\'affichage', type: 'number' },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
  locations: {
    title: 'Localisations', endpoint: '/stock-locations', subModuleKey: 'stock.referentiels',
    filters: ['type', 'business_unit_id'],
    fields: [
      { key: 'code', label: 'Code' },
      { key: 'nom', label: 'Nom', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['entrepot', 'magasin', 'zone', 'transit'], required: true, default: 'entrepot' },
      { key: 'parent_id', label: 'Localisation parente (pour une zone)', type: 'fkSelect', listKey: 'locations' },
      { key: 'site_id', label: 'Site (optionnel)', type: 'siteSelect' },
      { key: 'entity_id', label: 'Entité (optionnel)', type: 'entitySelect' },
      { key: 'business_unit_id', label: 'Business Unit (optionnel)', type: 'fkSelect', listKey: 'businessUnits' },
      { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
};

const TABS = [['movementTypes', 'Types de mouvement'], ['locations', 'Localisations']];

export default function StockReferentiels() {
  const { user } = useAuth();
  const canView = hasSubModuleLevel(user, 'stock.referentiels');
  const [tab, setTab] = useState('movementTypes');
  const [entities, setEntities] = useState([]);
  const [sites, setSites] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    if (!canView) return;
    client.get('/entities').then(r => setEntities(r.data)).catch(() => {});
    client.get('/sites').then(r => setSites(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBusinessUnits(r.data)).catch(() => {});
    client.get('/stock-locations').then(r => setLocations(r.data)).catch(() => {});
  }, [canView]);

  if (!canView) return <div><StockSectionNav /><p>Le référentiel Stock ne vous a pas été accordé.</p></div>;

  const config = CONFIGS[tab];
  return (
    <div>
      <StockSectionNav />
      <div style={{ marginBottom: 6 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Référentiels Stock</h1>
        <p className="page-subtitle" style={{ margin: '4px 0 0' }}>Types de mouvement (avec leur impact sur le stock) et localisations physiques.</p>
      </div>
      <nav className="subnav">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={tab === key ? 'active' : undefined}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}>
            {label}
          </button>
        ))}
      </nav>
      <ReferentialPage
        key={tab} title={config.title} endpoint={config.endpoint} fields={config.fields}
        filters={config.filters || []}
        entities={entities} sites={sites} lists={{ businessUnits, locations }}
        canAdd={hasSubModuleLevel(user, config.subModuleKey, 'ajout')}
        canEdit={hasSubModuleLevel(user, config.subModuleKey, 'edition')}
      />
    </div>
  );
}
