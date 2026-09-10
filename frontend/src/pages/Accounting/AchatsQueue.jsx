import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import Pagination from '../../components/Pagination.jsx';
import ComptaSubnav, { ProcessingBadge } from './ComptaSubnav.jsx';
import { StatusBadge } from '../PurchaseRequests/statusLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR'));

export default function AchatsQueue() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canProcess = hasSubModuleLevel(user, 'comptabilite.achats', 'edition');
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ from: '', to: '', status: '', agent: 'all', entity_id: '', q: '' });

  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');
  const setF = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };

  useEffect(() => { client.get('/entities').then(r => setEntities(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    setLoading(true); setError('');
    const params = { page, pageSize: 20 };
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.status) params.status = filters.status;
    if (filters.entity_id) params.entity_id = filters.entity_id;
    if (filters.q.trim()) params.q = filters.q.trim();
    if (filters.agent === 'mine') params.mine = 'true';
    else if (filters.agent === 'unassigned') params.unassigned = 'true';
    const timer = setTimeout(() => {
      client.get('/accounting/purchase-orders', { params })
        .then(r => setData(r.data))
        .catch(e => setError(e.response?.data?.error || t('acc.loadError')))
        .finally(() => setLoading(false));
      client.get('/accounting/purchase-orders/stats', { params: filters.entity_id ? { entity_id: filters.entity_id } : {} })
        .then(r => setStats(r.data)).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [page, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items || [];

  return (
    <div>
      <ComptaSubnav />
      <h1 className="page-title" style={{ marginBottom: 6 }}>{t('acc.achats.title')}</h1>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>{t('acc.achats.subtitle')}</p>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <StatCard label={t('acc.stat.notProcessed')} value={stats.non_traites} accent="var(--status-amber-fg, #b45309)" />
          <StatCard label={t('acc.stat.inProgress')} value={stats.en_cours} />
          <StatCard label={t('acc.stat.processed')} value={stats.traites} accent="var(--status-green-fg, #15803d)" />
          <StatCard label={t('acc.stat.total')} value={stats.total} />
          <StatCard label={t('acc.stat.thisMonth')} value={stats.ce_mois} />
          <StatCard label={t('acc.stat.suppliers')} value={stats.fournisseurs} />
        </div>
      )}

      <div className="form-inline" style={{ marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="search" value={filters.q} onChange={e => setF('q', e.target.value)}
          placeholder={t('acc.searchPlaceholder')} style={{ minWidth: 240 }} />
        <label className="field">{t('acc.f.from')}<input type="date" value={filters.from} onChange={e => setF('from', e.target.value)} /></label>
        <label className="field">{t('acc.f.to')}<input type="date" value={filters.to} onChange={e => setF('to', e.target.value)} /></label>
        <select value={filters.status} onChange={e => setF('status', e.target.value)}>
          <option value="">{t('acc.f.allStatuses')}</option>
          <option value="NOT_PROCESSED">{t('acc.status.not')}</option>
          <option value="IN_PROGRESS">{t('acc.status.inprogress')}</option>
          <option value="PROCESSED">{t('acc.status.done')}</option>
        </select>
        <select value={filters.agent} onChange={e => setF('agent', e.target.value)}>
          <option value="all">{t('acc.f.allAgents')}</option>
          <option value="mine">{t('acc.f.mine')}</option>
          <option value="unassigned">{t('acc.f.unassigned')}</option>
        </select>
        <select value={filters.entity_id} onChange={e => setF('entity_id', e.target.value)}>
          <option value="">{t('acc.f.allEntities')}</option>
          {entities.map(e => <option key={e.id} value={e.id}>{e.code}</option>)}
        </select>
      </div>

      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {loading ? <Loading /> : (
            <table>
              <thead><tr>
                <th>{t('acc.th.bdc')}</th><th>{t('acc.th.da')}</th><th>{t('acc.th.bdcDate')}</th>
                <th>{t('acc.th.requester')}</th><th>{t('acc.th.dept')}</th><th>{t('acc.th.supplier')}</th>
                <th className="num">{t('acc.th.amount')}</th><th>{t('acc.th.entity')}</th>
                <th>{t('acc.th.daStatus')}</th><th>{t('acc.th.processing')}</th><th />
              </tr></thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.po_id}>
                    <td><Link to={`/comptabilite/traitement/achats/${r.po_id}`}><strong>{r.bdc_numero}</strong></Link></td>
                    <td>{r.da_numero}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{dfmt(r.generated_at)}</td>
                    <td>{r.demandeur || '—'}</td>
                    <td>{r.departement || '—'}</td>
                    <td>{r.fournisseur || '—'}</td>
                    <td className="num" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(r.montant)} {r.devise}</td>
                    <td>{r.entity_code}</td>
                    <td><StatusBadge status={r.da_status} /></td>
                    <td><ProcessingBadge status={r.processing_status} name={r.processing_status === 'PROCESSED' ? r.processed_nom : r.assigned_nom} /></td>
                    <td>
                      <Link to={`/comptabilite/traitement/achats/${r.po_id}`} className="btn btn-secondary btn-sm">
                        {r.processing_status === 'NOT_PROCESSED' && canProcess ? t('acc.action.process') : t('acc.action.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td className="empty-row" colSpan={11}>{t('acc.empty')}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {!loading && data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="card" style={{ minWidth: 130, flex: '1 1 140px' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: accent || 'var(--color-text)' }}>{value ?? '—'}</div>
    </div>
  );
}
