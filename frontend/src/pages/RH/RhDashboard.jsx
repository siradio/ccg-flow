import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import client from '../../api/client';
import RhSubnav, { canValidateRh } from './RhSubnav';
import { useAuth } from '../../auth/AuthContext';
import { RH_TYPE_LABELS } from './rhStatus.jsx';
import { useI18n } from '../../i18n/I18nContext';
import JournaliersPanel from './JournaliersDashboard';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// Liste des mois (YYYY-MM) entre deux dates incluses — pour une courbe continue (mois à 0 compris).
function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
    if (out.length > 60) break; // garde-fou
  }
  return out;
}

function StatCard({ label, value, to, accent }) {
  const inner = (
    <div className="card" style={{ minWidth: 140, flex: '1 1 160px' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4, color: accent || 'var(--color-text)' }}>{value}</div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none', flex: '1 1 160px', display: 'flex' }}>{inner}</Link> : inner;
}

// Petite répartition en barres horizontales (sans dépendance).
function Repartition({ title, rows, labelKey }) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map(r => r.n));
  return (
    <section className="card" style={{ flex: '1 1 300px' }}>
      <h2 style={{ marginTop: 0, fontSize: 15 }}>{title}</h2>
      {rows.length === 0 && <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>{t('rh.dash.none')}</p>}
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 32px', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[labelKey] || '—'}</span>
            <span style={{ background: 'var(--color-hover)', borderRadius: 4, height: 10 }}>
              <span style={{ display: 'block', height: 10, borderRadius: 4, width: `${Math.round((r.n / max) * 100)}%`, background: 'var(--color-primary, #2563eb)' }} />
            </span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.n}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// Tableau de bord réservé aux valideurs RH ; un simple demandeur est redirigé vers ses demandes.
export default function RhDashboard() {
  const { user } = useAuth();
  if (!canValidateRh(user)) return <Navigate to="/rh/mes-demandes" replace />;
  return <RhDashboardInner />;
}

function RhDashboardInner() {
  const { t, lang } = useI18n();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('rh'); // 'rh' = synthèse RH, 'journaliers' = suivi des journaliers

  useEffect(() => {
    if (tab !== 'rh') return;
    client.get('/rh/dashboard').then(r => setD(r.data)).catch(e => setError(e.response?.data?.error || t('rh.loadError')));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const dfmt = (x) => x ? new Date(x).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—';
  const typeLabel = (r) => r.type_libelle || t(RH_TYPE_LABELS[r.type] || 'rh.type.absence');

  function Liste({ title, rows, dateCol }) {
    return (
      <section className="card" style={{ padding: 0, flex: '1 1 380px' }}>
        <h2 style={{ margin: 0, padding: '12px 14px', fontSize: 15 }}>{title} ({rows.length})</h2>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>{t('rh.th.employee')}</th><th>{t('rh.th.type')}</th><th>{t('rh.th.period')}</th><th className="num">{t('rh.th.days')}</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><Link to={`/rh/demandes/${r.id}`}>{r.employe || r.numero}</Link></td>
                  <td>{typeLabel(r)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{dfmt(r.date_debut)} → {dfmt(r.date_fin)}</td>
                  <td className="num">{r.jours ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="empty-row" colSpan={4}>{t('rh.dash.none')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <div>
      <RhSubnav />
      <h1 className="page-title" style={{ marginBottom: 12 }}>{t('rh.dash.title')}</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['rh', t('rh.dash.tabRh')], ['conges', t('rh.dash.tabConges')], ['journaliers', t('rh.nav.journaliers')]].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'conges' && <CongesPanel />}
      {tab === 'journaliers' && <JournaliersPanel />}

      {tab === 'rh' && error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}
      {tab === 'rh' && !d && !error && <p>{t('rh.loading')}</p>}
      {tab === 'rh' && d && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatCard label={t('rh.dash.headcount')} value={d.effectif.total} />
            <StatCard label={t('rh.dash.toApprove')} value={d.demandes.aValider} to="/rh/a-valider" accent={d.demandes.aValider > 0 ? 'var(--status-indigo-fg, #4f46e5)' : undefined} />
            <StatCard label={t('rh.dash.inValidation')} value={d.demandes.enValidation} />
            <StatCard label={t('rh.dash.absentNow')} value={d.enCours.length} />
            <StatCard label={t('rh.dash.recruitments')} value={d.demandes.recrutement} />
            <StatCard label={t('rh.dash.cdi')} value={d.demandes.cdi} />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Repartition title={t('rh.dash.byContract')} rows={d.effectif.parContrat} labelKey="type_contrat" />
            <Repartition title={t('rh.dash.byEntity')} rows={d.effectif.parEntite} labelKey="code" />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Liste title={t('rh.dash.currentAbsences')} rows={d.enCours} />
            <Liste title={t('rh.dash.upcoming')} rows={d.aVenir} />
          </div>
        </>
      )}
    </div>
  );
}

// Carte KPI compacte (congés).
function KpiCard({ label, value, accent, sub }) {
  return (
    <div className="card" style={{ minWidth: 150, flex: '1 1 160px' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4, color: accent || 'var(--color-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Répartition en barres horizontales d'un total de jours (par BU, par type).
function BarList({ title, rows }) {
  const max = Math.max(1, ...rows.map(r => r.jours));
  return (
    <section className="card" style={{ flex: '1 1 300px' }}>
      <h2 style={{ marginTop: 0, fontSize: 15 }}>{title}</h2>
      {rows.length === 0 && <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>—</p>}
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 44px', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <span style={{ background: 'var(--color-hover)', borderRadius: 4, height: 10 }}>
              <span style={{ display: 'block', height: 10, borderRadius: 4, width: `${Math.round((r.jours / max) * 100)}%`, background: 'var(--color-primary, #2563eb)' }} />
            </span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.jours}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// Onglet « Congés » : courbe mensuelle + KPIs + répartitions, filtrable (période, entité, BU, type).
function CongesPanel() {
  const { t } = useI18n();
  const y = new Date().getFullYear();
  const [f, setF] = useState({ from: `${y}-01-01`, to: `${y}-12-31`, entityId: '', businessUnitId: '', typeId: '' });
  const [opts, setOpts] = useState({ entities: [], bus: [], types: [] });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      client.get('/entities').then(r => r.data).catch(() => []),
      client.get('/business-units').then(r => r.data).catch(() => []),
      client.get('/rh/types?domaine=conge').then(r => r.data).catch(() => []),
    ]).then(([entities, bus, types]) => setOpts({ entities, bus, types }));
  }, []);

  function load() {
    setLoading(true);
    const params = {};
    for (const key of ['from', 'to', 'entityId', 'businessUnitId', 'typeId']) if (f[key]) params[key] = f[key];
    client.get('/rh/dashboard/conges', { params }).then(r => setData(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const chartData = (() => {
    if (!data) return [];
    const map = Object.fromEntries((data.series || []).map(s => [s.periode, s.jours]));
    const dmap = Object.fromEntries((data.series || []).map(s => [s.periode, s.demandes]));
    return monthsBetween(data.from, data.to).map(p => {
      const mm = p.split('-')[1];
      return { periode: p, label: `${MOIS_COURT[Number(mm) - 1]} ${p.slice(2, 4)}`, jours: map[p] || 0, demandes: dmap[p] || 0 };
    });
  })();
  const k = data?.kpis || {};

  return (
    <div>
      <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <label className="field">{t('rh.dash.conges.from')}<input type="date" value={f.from} onChange={e => set('from', e.target.value)} /></label>
        <label className="field">{t('rh.dash.conges.to')}<input type="date" value={f.to} min={f.from || undefined} onChange={e => set('to', e.target.value)} /></label>
        {opts.entities.length > 1 && (
          <label className="field">{t('rh.dash.conges.entity')}
            <select value={f.entityId} onChange={e => set('entityId', e.target.value)}>
              <option value="">{t('rh.dash.conges.all')}</option>
              {opts.entities.map(en => <option key={en.id} value={en.id}>{en.code}</option>)}
            </select>
          </label>
        )}
        {opts.bus.length > 0 && (
          <label className="field" style={{ minWidth: 160 }}>{t('rh.dash.conges.bu')}
            <select value={f.businessUnitId} onChange={e => set('businessUnitId', e.target.value)}>
              <option value="">{t('rh.dash.conges.all')}</option>
              {opts.bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
          </label>
        )}
        {opts.types.length > 0 && (
          <label className="field" style={{ minWidth: 160 }}>{t('rh.dash.conges.type')}
            <select value={f.typeId} onChange={e => set('typeId', e.target.value)}>
              <option value="">{t('rh.dash.conges.all')}</option>
              {opts.types.map(ty => <option key={ty.id} value={ty.id}>{ty.libelle}</option>)}
            </select>
          </label>
        )}
        <button className="btn btn-primary" onClick={load}>{t('rh.dash.conges.apply')}</button>
      </div>

      {loading && !data ? <p>{t('rh.loading')}</p> : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <KpiCard label={t('rh.dash.conges.totalDays')} value={k.jours ?? 0} accent="var(--color-primary, #2563eb)" />
            <KpiCard label={t('rh.dash.conges.requests')} value={k.demandes ?? 0} />
            <KpiCard label={t('rh.dash.conges.employees')} value={k.employes ?? 0} />
            <KpiCard label={t('rh.dash.conges.avg')} value={k.moyenne ?? 0} sub={t('rh.dash.conges.avgSub')} />
            <KpiCard label={t('rh.dash.conges.ongoing')} value={k.enCours ?? 0} accent={k.enCours ? 'var(--status-green-fg, #15803d)' : undefined} />
            <KpiCard label={t('rh.dash.conges.pending')} value={k.enAttente ?? 0} accent={k.enAttente ? 'var(--status-indigo-fg, #4f46e5)' : undefined} />
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>{t('rh.dash.conges.chartTitle')}</h2>
            <div style={{ width: '100%', height: 320, marginTop: 10 }}>
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradConge" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis width={40} tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, t('rh.dash.conges.days')]} />
                  <Area type="monotone" dataKey="jours" name={t('rh.dash.conges.days')} stroke="#2563eb" strokeWidth={2.5} fill="url(#gradConge)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <BarList title={t('rh.dash.conges.byBu')} rows={data?.parBu || []} />
            <BarList title={t('rh.dash.conges.byType')} rows={data?.parType || []} />
          </div>
        </>
      )}
    </div>
  );
}
