import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import Pagination from '../../components/Pagination.jsx';
import DsiSubnav from './DsiSubnav';
import MaintenanceForm from './MaintenanceForm.jsx';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR'));
const MSTATUT = { planifiee: ['Planifiée', 'neutral'], en_cours: ['En cours', 'amber'], terminee: ['Terminée', 'green'], annulee: ['Annulée', 'neutral'] };
function MStatut({ v }) {
  const [l, c] = MSTATUT[v] || [v, 'neutral'];
  const col = c === 'green' ? ['#dcfce7', '#15803d'] : c === 'amber' ? ['#fef3c7', '#b45309'] : ['var(--color-hover)', 'var(--color-text-muted)'];
  return <span style={{ background: col[0], color: col[1], padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{l}</span>;
}

export default function MaintenanceList() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canEdit = hasSubModuleLevel(user, 'dsi.maintenance', 'edition');
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ q: '', statut: '', overdue: false, upcoming: false });
  const [form, setForm] = useState(null); // {initial} | {} for new
  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');
  const setF = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
  const reload = () => setFilters(f => ({ ...f }));

  useEffect(() => {
    const params = { page };
    Object.entries(filters).forEach(([k, v]) => { if (v === true) params[k] = 'true'; else if (v) params[k] = v; });
    const timer = setTimeout(() => {
      client.get('/dsi/maintenance', { params }).then(r => setData(r.data)).catch(() => setData({ items: [], total: 0, page: 1, pageSize: 20 }));
      client.get('/dsi/maintenance/stats').then(r => setStats(r.data)).catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [page, filters]);

  const items = data?.items || [];
  async function save(payload, id) { if (id) await client.put(`/dsi/maintenance/${id}`, payload); else await client.post('/dsi/maintenance', payload); setForm(null); reload(); }

  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('dsi.maint.title')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({})}>{t('dsi.maint.new')}</button>}
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '14px 0' }}>
          <StatCard label={t('dsi.maint.stat.planned')} value={stats.planifiees} />
          <StatCard label={t('dsi.maint.stat.inProgress')} value={stats.en_cours} accent="var(--status-amber-fg,#b45309)" />
          <StatCard label={t('dsi.maint.stat.upcoming')} value={stats.a_venir} />
          <StatCard label={t('dsi.maint.stat.overdue')} value={stats.en_retard} accent="#b91c1c" />
          <StatCard label={t('dsi.maint.stat.done')} value={stats.terminees} accent="var(--status-green-fg,#15803d)" />
          <StatCard label={t('dsi.maint.stat.cost')} value={money(stats.cout_total)} />
        </div>
      )}

      <div className="form-inline" style={{ marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="search" value={filters.q} onChange={e => setF('q', e.target.value)} placeholder={t('dsi.maint.search')} style={{ minWidth: 240 }} />
        <select value={filters.statut} onChange={e => setF('statut', e.target.value)}>
          <option value="">{t('dsi.f.allStatuses')}</option>
          {Object.entries(MSTATUT).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={filters.overdue} onChange={e => setF('overdue', e.target.checked)} /> {t('dsi.maint.stat.overdue')}</label>
        <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={filters.upcoming} onChange={e => setF('upcoming', e.target.checked)} /> {t('dsi.maint.stat.upcoming')}</label>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {!data ? <Loading /> : (
            <table>
              <thead><tr>
                <th>{t('dsi.maint.equipment')}</th><th>{t('dsi.maint.type')}</th><th>{t('dsi.maint.statut')}</th>
                <th>{t('dsi.maint.technician')}</th><th>{t('dsi.maint.dateDebut')}</th><th>{t('dsi.maint.dateFin')}</th>
                <th className="num">{t('dsi.maint.cout')}</th><th>{t('dsi.maint.nextDate')}</th>{canEdit && <th />}
              </tr></thead>
              <tbody>
                {items.map(m => (
                  <tr key={m.id}>
                    <td><Link to={`/dsi/parc/${m.equipment_id}`}>{m.equipement_numero}</Link> <span style={{ color: 'var(--color-text-muted)' }}>{m.equipement_designation}</span></td>
                    <td>{m.type_libelle || '—'}</td>
                    <td><MStatut v={m.statut} /></td>
                    <td>{m.technician_nom || m.prestataire || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{dfmt(m.date_debut)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{dfmt(m.date_fin)}</td>
                    <td className="num">{money(m.cout)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{dfmt(m.next_date)}</td>
                    {canEdit && <td><button className="btn btn-secondary btn-sm" onClick={() => setForm({ initial: m })}>{t('common.edit')}</button></td>}
                  </tr>
                ))}
                {items.length === 0 && <tr><td className="empty-row" colSpan={canEdit ? 9 : 8}>{t('dsi.maint.empty')}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}

      {form && <MaintenanceForm initial={form.initial} onClose={() => setForm(null)} onSubmit={(p) => save(p, form.initial?.id)} />}
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
