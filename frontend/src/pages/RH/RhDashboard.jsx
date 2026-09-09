import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import RhSubnav from './RhSubnav';
import { RH_TYPE_LABELS } from './rhStatus.jsx';
import { useI18n } from '../../i18n/I18nContext';

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

export default function RhDashboard() {
  const { t, lang } = useI18n();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/rh/dashboard').then(r => setD(r.data)).catch(e => setError(e.response?.data?.error || t('rh.loadError')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <h1 className="page-title" style={{ marginBottom: 16 }}>{t('rh.dash.title')}</h1>
      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}
      {!d && !error && <p>{t('rh.loading')}</p>}
      {d && (
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
