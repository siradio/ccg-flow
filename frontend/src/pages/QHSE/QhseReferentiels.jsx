import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import ReferentialPage from '../Referentials/ReferentialPage';
import QhseSubnav from './QhseSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Référentiels QHSE (Lot 0) — onglets réutilisant la page CRUD générique (ReferentialPage) sur les
// endpoints /api/qhse/referentials/*. Catalogues du laboratoire : types d'analyses, paramètres,
// milieux de culture, germes. Les seuils/spécifications arrivent au Lot 1.
const boolActif = { key: 'actif', label: 'Actif', type: 'checkbox', default: true };
const ordre = { key: 'ordre', label: 'Ordre', type: 'number' };
const lookupFields = [
  { key: 'libelle', label: 'Libellé', required: true },
  { key: 'code', label: 'Code', required: true },
  ordre,
  boolActif,
];
const RESULT_TYPES = ['numerique', 'qualitatif', 'booleen', 'texte'];
const RESULT_LABELS = { numerique: 'Numérique', qualitatif: 'Qualitatif', booleen: 'Booléen', texte: 'Texte' };

export default function QhseReferentiels() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canAdd = hasSubModuleLevel(user, 'qhse.referentiels', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'qhse.referentiels', 'edition');
  const [tab, setTab] = useState('analysisTypes');
  const [analysisTypes, setAnalysisTypes] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [qhseFormats, setQhseFormats] = useState([]);

  // Catalogues chargés une fois : servent de fkSelect (types d'analyses, et pour les Spécifications
  // les paramètres / produits / catégories / formats).
  useEffect(() => {
    client.get('/qhse/referentials/analysis-types').then(r => setAnalysisTypes(r.data.map(x => ({ id: x.id, nom: x.libelle })))).catch(() => {});
    client.get('/qhse/referentials/parameters').then(r => setParameters(r.data.map(x => ({ id: x.id, nom: x.libelle })))).catch(() => {});
    client.get('/qhse/referentials/formats').then(r => setQhseFormats(r.data.map(x => ({ id: x.id, nom: x.libelle })))).catch(() => {});
    client.get('/products').then(r => setProducts(r.data.map(x => ({ id: x.id, nom: x.designation })))).catch(() => {});
    client.get('/product-categories').then(r => setCategories(r.data.map(x => ({ id: x.id, nom: x.nom })))).catch(() => {});
  }, []);

  const lists = useMemo(() => ({ analysisTypes, parameters, products, categories, qhseFormats }),
    [analysisTypes, parameters, products, categories, qhseFormats]);

  const TABS = useMemo(() => ({
    analysisTypes: {
      title: 'Types d’analyses', endpoint: '/qhse/referentials/analysis-types',
      fields: lookupFields,
    },
    parameters: {
      title: 'Paramètres', endpoint: '/qhse/referentials/parameters',
      fields: [
        { key: 'analysis_type_id', label: 'Type d’analyse', type: 'fkSelect', listKey: 'analysisTypes', required: true },
        { key: 'libelle', label: 'Libellé', required: true },
        { key: 'code', label: 'Code', required: true },
        { key: 'unite', label: 'Unité' },
        { key: 'type_resultat', label: 'Type de résultat', type: 'select', options: RESULT_TYPES, optionLabels: RESULT_LABELS, default: 'numerique' },
        { key: 'methode', label: 'Méthode' },
        { key: 'precision_decimales', label: 'Décimales', type: 'number' },
        { key: 'obligatoire', label: 'Obligatoire', type: 'checkbox' },
        ordre,
        boolActif,
      ],
    },
    cultureMedia: {
      title: 'Milieux de culture', endpoint: '/qhse/referentials/culture-media',
      fields: lookupFields,
    },
    germs: {
      title: 'Germes', endpoint: '/qhse/referentials/germs',
      fields: lookupFields,
    },
    lines: { title: 'Lignes de conditionnement', endpoint: '/qhse/referentials/conditioning-lines', fields: lookupFields },
    flavors: { title: 'Saveurs', endpoint: '/qhse/referentials/flavors', fields: lookupFields },
    formats: { title: 'Formats', endpoint: '/qhse/referentials/formats', fields: lookupFields },
    samplingTypes: { title: 'Types de prélèvement', endpoint: '/qhse/referentials/sampling-types', fields: lookupFields },
    ncSeverities: { title: 'Gravités de non-conformité', endpoint: '/qhse/referentials/nc-severities', fields: lookupFields },
    specifications: {
      title: 'Spécifications / seuils de conformité', endpoint: '/qhse/referentials/specifications',
      fields: [
        { key: 'parameter_id', label: 'Paramètre', type: 'fkSelect', listKey: 'parameters', required: true },
        { key: 'product_id', label: 'Produit (facultatif)', type: 'fkSelect', listKey: 'products' },
        { key: 'category_id', label: 'Famille / catégorie (facultatif)', type: 'fkSelect', listKey: 'categories' },
        { key: 'format_id', label: 'Format (facultatif)', type: 'fkSelect', listKey: 'qhseFormats' },
        { key: 'seuil_min', label: 'Seuil min', type: 'number' },
        { key: 'seuil_max', label: 'Seuil max', type: 'number' },
        { key: 'critere', label: 'Critère / commentaire' },
        { key: 'version', label: 'Version', type: 'number', default: 1 },
        { key: 'date_effet', label: 'Date d’effet', type: 'date' },
        boolActif,
      ],
    },
    // Lot 2 — critères de contrôle production (type booléen / numérique + seuils facultatifs).
    productionCriteria: {
      title: 'Critères de contrôle production', endpoint: '/qhse/referentials/production-criteria',
      fields: [
        { key: 'libelle', label: 'Libellé', required: true },
        { key: 'code', label: 'Code' },
        { key: 'type_critere', label: 'Type', type: 'select', options: ['booleen', 'numerique'], optionLabels: { booleen: 'Booléen (OUI/NON)', numerique: 'Numérique' }, default: 'booleen' },
        { key: 'unite', label: 'Unité', showIf: { field: 'type_critere', equals: 'numerique' } },
        { key: 'seuil_min', label: 'Seuil min', type: 'number', showIf: { field: 'type_critere', equals: 'numerique' } },
        { key: 'seuil_max', label: 'Seuil max', type: 'number', showIf: { field: 'type_critere', equals: 'numerique' } },
        ordre,
        boolActif,
      ],
    },
    // Lot 2 — plans d'échantillonnage (n/c/m/M, ICMSF).
    samplingPlans: {
      title: 'Plans d’échantillonnage', endpoint: '/qhse/referentials/sampling-plans',
      fields: [
        { key: 'libelle', label: 'Libellé', required: true },
        { key: 'code', label: 'Code' },
        { key: 'parameter_id', label: 'Paramètre (facultatif)', type: 'fkSelect', listKey: 'parameters' },
        { key: 'product_id', label: 'Produit (facultatif)', type: 'fkSelect', listKey: 'products' },
        { key: 'category_id', label: 'Famille / catégorie (facultatif)', type: 'fkSelect', listKey: 'categories' },
        { key: 'format_id', label: 'Format (facultatif)', type: 'fkSelect', listKey: 'qhseFormats' },
        { key: 'taille_n', label: 'n (taille)', type: 'number' },
        { key: 'acceptation_c', label: 'c (acceptation)', type: 'number' },
        { key: 'seuil_m', label: 'm (seuil)', type: 'number' },
        { key: 'seuil_grand_m', label: 'M (seuil max)', type: 'number' },
        ordre,
        boolActif,
      ],
    },
  }), []);

  if (!hasSubModuleLevel(user, 'qhse.referentiels')) return <Navigate to="/" replace />;

  const current = TABS[tab];
  const TAB_ORDER = [
    ['analysisTypes', 'Types d’analyses'], ['parameters', 'Paramètres'],
    ['cultureMedia', 'Milieux de culture'], ['germs', 'Germes'],
    ['lines', 'Lignes'], ['flavors', 'Saveurs'], ['formats', 'Formats'],
    ['samplingTypes', 'Types de prélèvement'], ['ncSeverities', 'Gravités NC'],
    ['specifications', 'Spécifications / seuils'],
    ['productionCriteria', 'Critères production'], ['samplingPlans', 'Plans d’échantillonnage'],
  ];

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.ref.title')}</h1>
      <div className="form-inline" style={{ marginBottom: 14, gap: 8 }}>
        {TAB_ORDER.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-secondary'}`}>{label}</button>
        ))}
      </div>
      <ReferentialPage
        key={tab}
        title={current.title}
        endpoint={current.endpoint}
        fields={current.fields}
        lists={lists}
        canAdd={canAdd}
        canEdit={canEdit}
      />
    </div>
  );
}
