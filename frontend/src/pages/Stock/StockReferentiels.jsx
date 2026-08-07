import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from '../Referentials/ReferentialPage';
import StockSectionNav from './StockSectionNav';
import { useI18n } from '../../i18n/I18nContext';

// Refonte Stock (Lot 0) — Référentiels du module Stock : types de mouvement + localisations.
// Réutilise le composant générique ReferentialPage. Gaté par le sous-module stock.referentiels.
// Libellés/options via clés i18n (labelKey/optionNs) ; valeurs stockées (codes, slugs) inchangées.
const CONFIGS = {
  movementTypes: {
    titleKey: 'stref.title.movementTypes', endpoint: '/stock-movement-types', subModuleKey: 'stock.referentiels',
    filters: ['sens', 'actif'],
    fields: [
      { key: 'code', labelKey: 'stref.f.code', required: true },
      { key: 'libelle', labelKey: 'stref.f.libelle', required: true },
      { key: 'sens', labelKey: 'stref.f.sens', type: 'select', options: ['entree', 'sortie', 'neutre'], optionNs: 'sens', required: true },
      { key: 'requiert_validation', labelKey: 'stref.f.requiert_validation', type: 'checkbox' },
      { key: 'requiert_justificatif', labelKey: 'stref.f.requiert_justificatif', type: 'checkbox' },
      { key: 'ordre', labelKey: 'stref.f.ordre', type: 'number' },
      { key: 'actif', labelKey: 'stref.f.actif', type: 'checkbox', default: true },
    ],
  },
  locations: {
    titleKey: 'stref.title.locations', endpoint: '/stock-locations', subModuleKey: 'stock.referentiels',
    filters: ['type', 'business_unit_id'],
    fields: [
      { key: 'code', labelKey: 'stref.f.code' },
      { key: 'nom', labelKey: 'stref.f.nom', required: true },
      { key: 'type', labelKey: 'stref.f.type', type: 'select', options: ['entrepot', 'magasin', 'zone', 'transit'], optionNs: 'stref.loctype', required: true, default: 'entrepot' },
      { key: 'parent_id', labelKey: 'stref.f.parent_id', type: 'fkSelect', listKey: 'locations' },
      { key: 'site_id', labelKey: 'stref.f.site_id', type: 'siteSelect' },
      { key: 'entity_id', labelKey: 'stref.f.entity_id', type: 'entitySelect' },
      { key: 'business_unit_id', labelKey: 'stref.f.business_unit_id', type: 'fkSelect', listKey: 'businessUnits' },
      { key: 'actif', labelKey: 'stref.f.actif', type: 'checkbox', default: true },
    ],
  },
};

const TABS = [['movementTypes', 'stref.title.movementTypes'], ['locations', 'stref.title.locations']];

export default function StockReferentiels() {
  const { user } = useAuth();
  const { t } = useI18n();
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

  if (!canView) return <div><StockSectionNav /><p>{t('stref.notGranted')}</p></div>;

  const config = CONFIGS[tab];
  // Injecte les optionLabels traduits pour les selects porteurs d'un `optionNs`.
  const tFields = config.fields.map(f => (f.optionNs && f.options
    ? { ...f, optionLabels: Object.fromEntries(f.options.map(o => [o, t(`${f.optionNs}.${o}`)])) }
    : f));
  return (
    <div>
      <StockSectionNav />
      <div style={{ marginBottom: 6 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('stref.pageTitle')}</h1>
        <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{t('stref.pageSub')}</p>
      </div>
      <div style={{ display: 'inline-flex', gap: 4, background: 'rgba(128,128,128,0.12)', borderRadius: 12, padding: 4, margin: '12px 0 16px' }}>
        {TABS.map(([key, labelKey]) => {
          const active = tab === key;
          return (
            <button key={key} type="button" onClick={() => setTab(key)}
              style={{
                border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 600, fontSize: 13.5,
                padding: '7px 18px', borderRadius: 9, transition: 'background .15s, color .15s, box-shadow .15s',
                background: active ? 'var(--color-primary, #4f46e5)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text-muted, #6b7280)',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
              }}>
              {t(labelKey)}
            </button>
          );
        })}
      </div>
      <ReferentialPage
        key={tab} title={t(config.titleKey)} endpoint={config.endpoint} fields={tFields}
        filters={config.filters || []}
        entities={entities} sites={sites} lists={{ businessUnits, locations }}
        canAdd={hasSubModuleLevel(user, config.subModuleKey, 'ajout')}
        canEdit={hasSubModuleLevel(user, config.subModuleKey, 'edition')}
      />
    </div>
  );
}
