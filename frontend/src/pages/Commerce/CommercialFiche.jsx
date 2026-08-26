import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import client from '../../api/client';
import CommerceSubnav from './CommerceSubnav';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' GNF';
const short = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1).replace('.0', '') + ' Md';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(0) + ' M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + ' k';
  return String(v);
};
const pct = (n) => (n == null ? '—' : n.toLocaleString('fr-FR') + ' %');
const dfmt = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const curMonth = () => new Date().toISOString().slice(0, 7);
const MOIS_COURT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const STATUT_COLOR = {
  'Objectif dépassé': '#128a54', 'Objectif atteint': '#2554e0',
  'À surveiller': '#b45309', 'En retard': '#dc2626', 'Sans objectif': '#6b7280',
  brouillon: '#6b7280', soumis: '#b45309', valide: '#128a54', rejete: '#dc2626', annule: '#6b7280',
  calculee: '#6b7280', validee: '#2554e0', payee: '#128a54', annulee: '#dc2626',
};
function Kpi({ label, value, accent }) {
  return (
    <div className="card" style={{ flex: '1 1 130px', minWidth: 130 }}>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: accent, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

export default function CommercialFiche() {
  const { t } = useI18n();
  const { id } = useParams();
  const [mois, setMois] = useState(curMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    client.get(`/commerce/commerciaux/${id}/fiche?mois=${mois}`).then(r => setData(r.data)).catch(e => setError(e.response?.data?.error || t('com.fiche.notFound')));
  }, [id, mois]);

  async function exportPdf() {
    try {
      const res = await client.get(`/commerce/commerciaux/${id}/fiche.pdf?mois=${mois}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { setError(t('com.fiche.pdfError')); }
  }

  const evo = useMemo(() => (data?.mensuel || []).map(m => ({
    label: MOIS_COURT[Number(m.mois.slice(5, 7)) - 1], Objectif: m.objectif, Réalisé: m.realise,
  })), [data]);

  if (error) return <div><CommerceSubnav /><div className="alert alert-danger">{error}</div></div>;
  if (!data) return <div><CommerceSubnav /><p>{t('com.fiche.loading')}</p></div>;

  const c = data.commercial;
  const m = data.metrics;
  const produits = [...new Set((data.affectations || []).filter(a => a.product_nom).map(a => a.product_nom))];

  return (
    <div>
      <CommerceSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {c.code} — {c.prenom_affiche || ''} {c.nom_affiche || ''}
          <span className="badge" style={{ marginLeft: 10, background: 'var(--color-hover)', color: 'var(--color-text)' }}>{c.type === 'interne' ? t('com.fiche.interne') : t('com.fiche.externe')}</span>
        </h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="month" value={mois} onChange={e => setMois(e.target.value)} />
          <button className="btn btn-secondary btn-sm" onClick={exportPdf}>{t('com.fiche.printPdf')}</button>
          <Link to="/commerce/commerciaux" className="btn btn-secondary btn-sm">{t('com.fiche.backToList')}</Link>
        </div>
      </div>

      <section className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '6px 18px', fontSize: 14 }}>
          {c.matricule && <><span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.matricule')}</span><span style={{ fontWeight: 600 }}>{c.matricule}</span></>}
          <span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.bu')}</span><span style={{ fontWeight: 600 }}>{c.business_unit_nom || '—'}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.zone')}</span><span style={{ fontWeight: 600 }}>{c.zone_nom || '—'}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.telephone')}</span><span>{c.telephone_affiche || '—'}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.email')}</span><span>{c.email_affiche || '—'}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.produits')}</span><span>{produits.length ? produits.join(', ') : '—'}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.statut')}</span><span>{c.statut === 'actif' ? t('com.fiche.actif') : t('com.fiche.inactif')}</span>
        </div>
      </section>

      <h2 style={{ fontSize: 15, marginTop: 16 }}>{t('com.fiche.indicateurs', { mois: MOIS_COURT[Number(mois.slice(5, 7)) - 1], annee: mois.slice(0, 4) })}</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Kpi label={t('com.fiche.objectif')} value={money(m.objectif)} />
        <Kpi label={t('com.fiche.realise')} value={money(m.realise)} accent="#128a54" />
        <Kpi label={t('com.fiche.taux')} value={pct(m.taux)} />
        <Kpi label={t('com.fiche.ecart')} value={money(m.ecart)} accent={m.ecart < 0 ? '#dc2626' : '#128a54'} />
        <Kpi label={t('com.fiche.moyJour')} value={money(m.moyenne_jour)} />
        <Kpi label={t('com.fiche.projection')} value={money(m.projection)} />
        <Kpi label={t('com.fiche.rangMois')} value={m.rang ? `#${m.rang}` : '—'} />
        <div className="card" style={{ flex: '1 1 130px', minWidth: 130, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{t('com.fiche.statut')}</div>
          <div style={{ marginTop: 6 }}><span className="badge" style={{ background: STATUT_COLOR[m.statut], color: '#fff' }}>{t('com.perfStatut.' + m.statut)}</span></div>
        </div>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>{t('com.fiche.evoCa', { annee: mois.slice(0, 4) })}</h2>
        <div style={{ width: '100%', height: 280, marginTop: 10 }}>
          <ResponsiveContainer>
            <LineChart data={evo} margin={{ top: 6, right: 16, left: 6, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={short} width={64} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Line type="monotone" dataKey="Réalisé" name={t('com.serie.realise')} stroke="#128a54" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Objectif" name={t('com.serie.objectif')} stroke="#2554e0" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16, alignItems: 'flex-start' }}>
        <section className="card" style={{ flex: '1 1 420px', padding: 0, overflowX: 'auto' }}>
          <h2 style={{ fontSize: 15, padding: '12px 14px 0' }}>{t('com.fiche.histJour', { mois: MOIS_COURT[Number(mois.slice(5, 7)) - 1] })}</h2>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>{t('com.fiche.thDate')}</th><th>{t('com.fiche.thMoyens')}</th><th style={{ textAlign: 'right' }}>{t('com.fiche.thTotal')}</th><th>{t('com.fiche.thStatut')}</th></tr></thead>
            <tbody>
              {data.journalier.map(v => (
                <tr key={v.id}>
                  <td><Link to={`/commerce/versements/${v.id}`}>{dfmt(v.payment_date)}</Link></td>
                  <td style={{ fontSize: 13 }}>{v.moyens || '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(v.total_amount)}</td>
                  <td><span className="badge" style={{ background: STATUT_COLOR[v.status], color: '#fff' }}>{t('com.statut.' + v.status)}</span></td>
                </tr>
              ))}
              {data.journalier.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 16 }}>{t('com.fiche.noVersementMonth')}</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="card" style={{ flex: '1 1 420px', padding: 0, overflowX: 'auto' }}>
          <h2 style={{ fontSize: 15, padding: '12px 14px 0' }}>{t('com.fiche.histMensuel', { annee: mois.slice(0, 4) })}</h2>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>{t('com.fiche.thMois')}</th><th style={{ textAlign: 'right' }}>{t('com.fiche.thObjectif')}</th><th style={{ textAlign: 'right' }}>{t('com.fiche.thRealise')}</th><th style={{ textAlign: 'right' }}>%</th><th style={{ textAlign: 'right' }}>{t('com.fiche.thEcart')}</th><th>{t('com.fiche.thRang')}</th></tr></thead>
            <tbody>
              {data.mensuel.map(r => (
                <tr key={r.mois}>
                  <td>{MOIS_COURT[Number(r.mois.slice(5, 7)) - 1]}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.objectif)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(r.realise)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct(r.taux)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.ecart < 0 ? '#dc2626' : '#128a54' }}>{money(r.ecart)}</td>
                  <td>{r.rang ? `#${r.rang}` : '—'}</td>
                </tr>
              ))}
              {data.mensuel.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 16 }}>{t('com.fiche.noData')}</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16, maxWidth: 520 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('com.fiche.commissionTitle', { mois: MOIS_COURT[Number(mois.slice(5, 7)) - 1], annee: mois.slice(0, 4) })}</h2>
        {data.commission ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 18px', fontSize: 14 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.base')}</span><span style={{ fontWeight: 600 }}>{money(data.commission.base_montant)}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.taux2')}</span><span>{(Number(data.commission.taux) * 100).toLocaleString('fr-FR')} %</span>
            <span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.commission')}</span><span style={{ fontWeight: 700, color: '#128a54' }}>{money(data.commission.montant)}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>{t('com.fiche.statut')}</span><span><span className="badge" style={{ background: STATUT_COLOR[data.commission.statut] || '#6b7280', color: '#fff' }}>{t('com.commStatut.' + data.commission.statut)}</span></span>
          </div>
        ) : (
          <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>{t('com.fiche.notComputed')} <Link to="/commerce/commissions">{t('com.fiche.computeLink')}</Link></p>
        )}
      </section>
    </div>
  );
}
