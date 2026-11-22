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

  useEffect(() => {
    client.get('/qhse/referentials/analysis-types')
      .then(r => setAnalysisTypes(r.data.map(x => ({ id: x.id, nom: x.libelle }))))
      .catch(() => {});
  }, [tab]);

  const lists = useMemo(() => ({ analysisTypes }), [analysisTypes]);

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
  }), []);

  if (!hasSubModuleLevel(user, 'qhse.referentiels')) return <Navigate to="/" replace />;

  const current = TABS[tab];
  const TAB_ORDER = [['analysisTypes', 'Types d’analyses'], ['parameters', 'Paramètres'], ['cultureMedia', 'Milieux de culture'], ['germs', 'Germes']];

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
