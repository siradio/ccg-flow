import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from '../Referentials/ReferentialPage';
import DsiSubnav from './DsiSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Référentiels DSI — onglets réutilisant la page CRUD générique (ReferentialPage) sur les endpoints
// /api/dsi/referentials/*. Un seul écran, un onglet par référentiel administrable.
const boolField = (key, label) => ({ key, label, type: 'checkbox' });
const lookupFields = [
  { key: 'libelle', label: 'Libellé', required: true },
  { key: 'code', label: 'Code', required: true },
  { key: 'ordre', label: 'Ordre', type: 'number' },
  { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
];

export default function DsiReferentiels() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canAdd = hasSubModuleLevel(user, 'dsi.referentiels', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'dsi.referentiels', 'edition');
  const [tab, setTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [priorities, setPriorities] = useState([]);

  useEffect(() => {
    client.get('/dsi/referentials/categories').then(r => setCategories(r.data.map(c => ({ id: c.id, nom: c.libelle })))).catch(() => {});
    client.get('/dsi/referentials/priorities').then(r => setPriorities(r.data.map(p => ({ id: p.id, nom: p.libelle })))).catch(() => {});
  }, [tab]);

  const lists = useMemo(() => ({ categories, priorities }), [categories, priorities]);

  const TABS = useMemo(() => ({
    categories: { title: 'Catégories d’équipement', endpoint: '/dsi/referentials/categories', fields: lookupFields },
    types: {
      title: 'Types d’équipement', endpoint: '/dsi/referentials/types',
      fields: [
        { key: 'category_id', label: 'Catégorie', type: 'fkSelect', listKey: 'categories', required: true },
        { key: 'libelle', label: 'Libellé', required: true },
        { key: 'code', label: 'Code', required: true },
        { key: 'ordre', label: 'Ordre', type: 'number' },
        boolField('actif', 'Actif'),
      ],
    },
    brands: { title: 'Marques', endpoint: '/dsi/referentials/brands', fields: [{ key: 'nom', label: 'Nom', required: true }, boolField('actif', 'Actif')] },
    priorities: {
      title: 'Priorités', endpoint: '/dsi/referentials/priorities',
      fields: [
        { key: 'libelle', label: 'Libellé', required: true },
        { key: 'code', label: 'Code', required: true },
        { key: 'rang', label: 'Rang', type: 'number' },
        { key: 'couleur', label: 'Couleur (hex)' },
        boolField('actif', 'Actif'),
      ],
    },
    sla: {
      title: 'SLA (par priorité)', endpoint: '/dsi/referentials/sla',
      fields: [
        { key: 'priority_id', label: 'Priorité', type: 'fkSelect', listKey: 'priorities', required: true },
        { key: 'prise_en_charge_min', label: 'Prise en charge (min)', type: 'number', required: true },
        { key: 'resolution_min', label: 'Résolution (min)', type: 'number', required: true },
        { key: 'seuil_risque_pct', label: 'Seuil « à risque » (%)', type: 'number' },
        boolField('actif', 'Actif'),
      ],
    },
    ticketCategories: { title: 'Catégories de tickets', endpoint: '/dsi/referentials/ticket-categories', fields: lookupFields },
    ticketTypes: { title: 'Types de tickets', endpoint: '/dsi/referentials/ticket-types', fields: lookupFields },
    maintenanceTypes: { title: 'Types de maintenance', endpoint: '/dsi/referentials/maintenance-types', fields: lookupFields },
    activityTypes: { title: 'Types d’activité', endpoint: '/dsi/referentials/activity-types', fields: lookupFields },
    riskCategories: { title: 'Catégories de risque', endpoint: '/dsi/referentials/risk-categories', fields: lookupFields },
  }), []);

  if (!hasSubModuleLevel(user, 'dsi.referentiels')) return <Navigate to="/dsi" replace />;

  const cfg = TABS[tab];
  const TAB_ORDER = ['categories', 'types', 'brands', 'priorities', 'sla', 'ticketCategories', 'ticketTypes', 'maintenanceTypes', 'activityTypes', 'riskCategories'];

  return (
    <div>
      <DsiSubnav />
      <h1 className="page-title" style={{ marginBottom: 6 }}>{t('dsi.ref.title')}</h1>
      <p className="page-subtitle" style={{ marginBottom: 12 }}>{t('dsi.ref.subtitle')}</p>

      <div className="subnav" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {TAB_ORDER.map(k => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={tab === k ? 'active' : undefined}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: '6px 10px', color: tab === k ? 'var(--color-primary)' : 'var(--color-text-muted)', borderBottom: tab === k ? '2px solid var(--color-primary)' : '2px solid transparent' }}>
            {TABS[k].title}
          </button>
        ))}
      </div>

      <ReferentialPage
        key={tab} title={cfg.title} endpoint={cfg.endpoint} fields={cfg.fields}
        lists={lists} canAdd={canAdd} canEdit={canEdit}
      />
    </div>
  );
}
