import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import Loading from '../../components/Loading';
import Pagination from '../../components/Pagination.jsx';
import DsiSubnav from './DsiSubnav';
import { TicketStatutBadge, PriorityBadge, SlaBadge, TICKET_STATUTS } from './dsiLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

export default function TicketsList() {
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ q: '', statut: '', priority_id: '', category_id: '', open: true });
  const [cats, setCats] = useState([]);
  const [prios, setPrios] = useState([]);
  const setF = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');

  useEffect(() => {
    client.get('/dsi/referentials/ticket-categories').then(r => setCats(r.data)).catch(() => {});
    client.get('/dsi/referentials/priorities').then(r => setPrios(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = { page, pageSize: 20 };
    Object.entries(filters).forEach(([k, v]) => { if (v === true) params[k] = 'true'; else if (v) params[k] = v; });
    const timer = setTimeout(() => {
      client.get('/dsi/tickets', { params }).then(r => setData(r.data)).catch(() => setData({ items: [], total: 0, page: 1, pageSize: 20 }));
      client.get('/dsi/tickets/stats').then(r => setStats(r.data)).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [page, filters]);

  const items = data?.items || [];
  return (
    <div>
      <DsiSubnav />
      <h1 className="page-title" style={{ marginBottom: 12 }}>{t('dsi.tickets.title')}</h1>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <StatCard label={t('dsi.tk.stat.open')} value={stats.ouverts} />
          <StatCard label={t('dsi.tk.stat.inProgress')} value={stats.en_cours} accent="var(--status-amber-fg,#b45309)" />
          <StatCard label={t('dsi.tk.stat.waiting')} value={stats.en_attente} />
          <StatCard label={t('dsi.tk.stat.critical')} value={stats.critiques} accent="#b91c1c" />
          <StatCard label={t('dsi.tk.stat.createdToday')} value={stats.crees_aujourdhui} />
          <StatCard label={t('dsi.tk.stat.resolvedToday')} value={stats.resolus_aujourdhui} accent="var(--status-green-fg,#15803d)" />
        </div>
      )}

      <div className="form-inline" style={{ marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="search" value={filters.q} onChange={e => setF('q', e.target.value)} placeholder={t('dsi.tickets.search')} style={{ minWidth: 240 }} />
        <select value={filters.statut} onChange={e => setF('statut', e.target.value)}>
          <option value="">{t('dsi.f.allStatuses')}</option>
          {TICKET_STATUTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
        <select value={filters.priority_id} onChange={e => setF('priority_id', e.target.value)}>
          <option value="">{t('dsi.tk.allPriorities')}</option>
          {prios.map(p => <option key={p.id} value={p.id}>{p.libelle}</option>)}
        </select>
        <select value={filters.category_id} onChange={e => setF('category_id', e.target.value)}>
          <option value="">{t('dsi.f.allCategories')}</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
        <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={filters.open} onChange={e => setF('open', e.target.checked)} /> {t('dsi.tk.onlyOpen')}
        </label>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {!data ? <Loading /> : (
            <table>
              <thead><tr>
                <th>{t('dsi.tk.ref')}</th><th>{t('dsi.tk.objet')}</th><th>{t('dsi.tk.demandeur')}</th>
                <th>{t('dsi.tk.priorite')}</th><th>{t('dsi.tk.statut')}</th><th>SLA</th>
                <th>{t('dsi.tk.technicien')}</th><th>{t('dsi.tk.cree')}</th><th />
              </tr></thead>
              <tbody>
                {items.map(tk => (
                  <tr key={tk.id}>
                    <td><Link to={`/dsi/tickets/${tk.id}`}><strong>{tk.reference}</strong></Link></td>
                    <td>{tk.objet}</td>
                    <td>{tk.demandeur_nom || '—'}</td>
                    <td><PriorityBadge libelle={tk.priorite} couleur={tk.priorite_couleur} /></td>
                    <td><TicketStatutBadge statut={tk.statut} /></td>
                    <td><SlaBadge sla={tk.sla} /></td>
                    <td>{tk.technician_nom || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{dfmt(tk.created_at)}</td>
                    <td><Link to={`/dsi/tickets/${tk.id}`} className="btn btn-secondary btn-sm">{t('dsi.action.open')}</Link></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td className="empty-row" colSpan={9}>{t('dsi.tickets.empty')}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="card" style={{ minWidth: 120, flex: '1 1 130px' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: accent || 'var(--color-text)' }}>{value ?? '—'}</div>
    </div>
  );
}
