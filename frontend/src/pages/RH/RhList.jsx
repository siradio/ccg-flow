import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { useSort, SortTh } from '../../components/useSort.jsx';
import RhSubnav from './RhSubnav';
import { RhStatusBadge, RH_TYPE_LABELS } from './rhStatus.jsx';

const empName = (r) => `${r.employee_prenom || ''} ${r.employee_nom || ''}`.trim()
  || (r.created_by_prenom ? `${r.created_by_prenom} ${r.created_by_nom}` : '—');

function RhList({ scope, title, showNew }) {
  const { t, lang } = useI18n();
  const { sort, by, apply } = useSort();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    client.get(`/rh/requests?scope=${scope}`)
      .then(r => setRows(r.data))
      .catch(e => setError(e.response?.data?.error || t('rh.loadError')))
      .finally(() => setLoading(false));
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const dfmt = (d) => d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—';
  const term = q.trim().toLowerCase();
  const filtered = !term ? rows : rows.filter(r =>
    [r.numero, empName(r), r.type_libelle, r.entity_code].some(v => String(v || '').toLowerCase().includes(term)));
  const sorted = apply(filtered);

  return (
    <div>
      <RhSubnav />
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
        {showNew && <Link to="/rh/demandes/absence/new" className="btn btn-primary">{t('rh.newAbsence')}</Link>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`${t('common.search')}…`} style={{ minWidth: 280 }} />
      </div>
      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <SortTh label={t('rh.th.number')} colKey="numero" get={r => r.numero} sort={sort} by={by} />
              <SortTh label={t('rh.th.type')} colKey="type" get={r => r.type_libelle || r.type} sort={sort} by={by} />
              <SortTh label={t('rh.th.employee')} colKey="emp" get={empName} sort={sort} by={by} />
              <SortTh label={t('rh.th.entity')} colKey="entity" get={r => r.entity_code} sort={sort} by={by} />
              <SortTh label={t('rh.th.period')} colKey="debut" get={r => (r.date_debut ? new Date(r.date_debut).getTime() : 0)} sort={sort} by={by} />
              <SortTh label={t('rh.th.days')} colKey="jours" get={r => Number(r.jours) || 0} sort={sort} by={by} />
              <SortTh label={t('rh.th.status')} colKey="statut" get={r => r.statut} sort={sort} by={by} />
              <SortTh label={t('rh.th.createdAt')} colKey="created" get={r => new Date(r.created_at).getTime()} sort={sort} by={by} />
            </tr></thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id}>
                  <td><Link to={`/rh/demandes/${r.id}`}>{r.numero || `#${r.id}`}</Link></td>
                  <td>{r.type_libelle || t(RH_TYPE_LABELS[r.type] || 'rh.type.absence')}</td>
                  <td>{empName(r)}</td>
                  <td>{r.entity_code}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{dfmt(r.date_debut)} → {dfmt(r.date_fin)}</td>
                  <td className="num">{r.jours ?? '—'}</td>
                  <td><RhStatusBadge statut={r.statut} /></td>
                  <td>{dfmt(r.created_at)}</td>
                </tr>
              ))}
              {!loading && sorted.length === 0 && (
                <tr><td className="empty-row" colSpan={8}>{term ? t('rh.emptySearch') : t('rh.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function MesDemandes() { const { t } = useI18n(); return <RhList scope="mine" title={t('rh.nav.mine')} showNew />; }
export function AValider() { const { t } = useI18n(); return <RhList scope="pending" title={t('rh.nav.pending')} />; }
export function ToutesDemandes() { const { t } = useI18n(); return <RhList scope="all" title={t('rh.nav.all')} />; }
