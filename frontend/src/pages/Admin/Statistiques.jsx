import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import client from '../../api/client';
import Loading from '../../components/Loading';
import { useI18n } from '../../i18n/I18nContext';

const RANGES = [
  { days: 7, labelKey: 'adm.stats.range.d7' },
  { days: 30, labelKey: 'adm.stats.range.d30' },
  { days: 90, labelKey: 'adm.stats.range.d90' },
];

function fmtDateTime(v, lang) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// Étiquette d'axe compacte (jj/mm) à partir d'une clé 'YYYY-MM-DD'.
function fmtTick(day) {
  const [, m, d] = String(day).split('-');
  return `${d}/${m}`;
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="card" style={{ flex: '1 1 160px', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function Statistiques() {
  const { t, lang } = useI18n();
  const [stats, setStats] = useState(null);
  const [daily, setDaily] = useState([]);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/stats/logins').then(res => setStats(res.data)).catch(e => setError(e.response?.data?.error || t('adm.stats.loadError')));
  }, [t]);
  useEffect(() => {
    client.get(`/stats/logins/daily?days=${days}`).then(res => setDaily(res.data)).catch(() => {});
  }, [days]);

  const filteredUsers = useMemo(() => {
    const list = stats?.perUser || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(u => `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(q));
  }, [stats, search]);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!stats) return <Loading />;

  const tot = stats.totals;

  return (
    <div>
      <h1 className="page-title">{t('adm.stats.title')}</h1>
      <p style={{ color: 'var(--color-text-muted)', marginTop: -6, fontSize: 13 }}>
        {t('adm.stats.subtitle')}
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <KpiCard label={t('adm.stats.kpi.totalLogins')} value={tot.total_logins} hint={t('adm.stats.kpi.sinceStart')} />
        <KpiCard label={t('adm.stats.kpi.logins7')} value={tot.logins_7d} hint={t('adm.stats.kpi.over30', { n: tot.logins_30d })} />
        <KpiCard label={t('adm.stats.kpi.active7')} value={tot.active_7d} hint={t('adm.stats.kpi.active30', { n: tot.active_30d })} />
        <KpiCard label={t('adm.stats.kpi.neverConnected')} value={tot.never_connected} hint={t('adm.stats.kpi.ofAccounts', { n: tot.total_users })} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <strong>{t('adm.stats.perDay')}</strong>
          <div className="form-inline">
            {RANGES.map(r => (
              <button key={r.days} onClick={() => setDays(r.days)}
                className={`btn btn-sm ${days === r.days ? 'btn-primary' : 'btn-secondary'}`}>
                {t(r.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tickFormatter={fmtTick} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
              <Tooltip
                labelFormatter={fmtTick}
                formatter={v => [v, t('adm.stats.connections')]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-border)' }}
              />
              <Bar dataKey="count" name={t('adm.stats.connections')} fill="#2454e0" radius={[3, 3, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <strong>{t('adm.stats.perUser')}</strong>
          <input placeholder={t('adm.common.searchNameEmail')} value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 240 }} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('adm.stats.col.user')}</th>
                <th>{t('adm.stats.col.email')}</th>
                <th style={{ textAlign: 'right' }}>{t('adm.stats.col.logins')}</th>
                <th>{t('adm.stats.col.lastLogin')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.id}>
                  <td>{u.prenom} {u.nom}{u.actif ? '' : t('adm.stats.disabledSuffix')}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{u.email}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {u.login_count > 0
                      ? u.login_count
                      : <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}>—</span>}
                  </td>
                  <td style={{ color: u.last_login ? 'var(--color-text)' : 'var(--color-text-faint)' }}>{fmtDateTime(u.last_login, lang)}</td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr><td colSpan={4} className="empty-row">{t('adm.stats.noneMatch')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
