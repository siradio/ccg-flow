import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import client from '../../api/client';
import CommerceSubnav from './CommerceSubnav';
import { ExportButtons } from '../../utils/exportData';

const money = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' GNF';
const short = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1).replace('.0', '') + ' Md';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(0) + ' M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + ' k';
  return String(v);
};
const pct = (n) => (n == null ? '—' : n.toLocaleString('fr-FR') + ' %');
const curMonth = () => new Date().toISOString().slice(0, 7);
const MOIS_COURT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const STATUT_COLOR = {
  'Objectif dépassé': '#128a54', 'Objectif atteint': '#2554e0',
  'À surveiller': '#b45309', 'En retard': '#dc2626', 'Sans objectif': '#6b7280',
};

function Kpi({ label, value, accent }) {
  return (
    <div className="card" style={{ flex: '1 1 150px', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: accent, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

export default function DashboardCommerce() {
  const [mois, setMois] = useState(curMonth());
  const [bus, setBus] = useState([]);
  const [buId, setBuId] = useState('');
  const [data, setData] = useState(null);
  const [evolution, setEvolution] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {}); }, []);

  const annee = mois.slice(0, 4);

  useEffect(() => {
    setError('');
    const p = new URLSearchParams({ mois });
    if (buId) p.append('business_unit_id', buId);
    client.get('/commerce/dashboard?' + p.toString()).then(r => setData(r.data)).catch(e => setError(e.response?.data?.error || 'Erreur.'));
  }, [mois, buId]);

  useEffect(() => {
    const p = new URLSearchParams({ annee });
    if (buId) p.append('business_unit_id', buId);
    client.get('/commerce/dashboard/evolution?' + p.toString()).then(r => setEvolution(r.data.mois || [])).catch(() => setEvolution([]));
  }, [annee, buId]);

  const k = data?.kpi;
  const evoData = useMemo(() => evolution.map(m => ({
    label: MOIS_COURT[Number(m.mois.slice(5, 7)) - 1],
    Objectif: m.objectif_total, Réalisé: m.realise_total,
  })), [evolution]);

  const exportCols = [
    { key: 'rang', label: 'Rang', type: 'number' }, { key: 'code', label: 'Code' }, { key: 'nom', label: 'Commercial' },
    { key: 'business_unit_nom', label: 'BU' }, { key: 'objectif', label: 'Objectif', type: 'number' },
    { key: 'realise', label: 'Réalisé', type: 'number' }, { key: 'taux', label: '%', type: 'number' },
    { key: 'ecart', label: 'Écart', type: 'number' }, { key: 'moyenne_jour', label: 'Moy/jour', type: 'number' },
    { key: 'projection', label: 'Projection', type: 'number' }, { key: 'statut', label: 'Statut' },
  ];
  const exportRows = useMemo(() => (data?.lignes || []).map(l => ({ ...l, nom: `${l.prenom || ''} ${l.nom || ''}`.trim() })), [data]);

  return (
    <div>
      <CommerceSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Tableau de bord commercial</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={mois} onChange={e => setMois(e.target.value)} />
          <select value={buId} onChange={e => setBuId(e.target.value)}>
            <option value="">Toutes les BU</option>
            {bus.map(b => <option key={b.id} value={String(b.id)}>{b.nom}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      {k && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '14px 0' }}>
            <Kpi label="Objectif total" value={money(k.objectif_total)} />
            <Kpi label="Réalisé" value={money(k.realise_total)} accent="#128a54" />
            <Kpi label="Écart" value={money(k.ecart)} accent={k.ecart < 0 ? '#dc2626' : '#128a54'} />
            <Kpi label="% réalisation" value={pct(k.taux)} />
            <Kpi label="Projection fin de mois" value={money(k.projection_total)} />
            <Kpi label="Reste à faire" value={money(k.reste)} />
            <Kpi label="Commerciaux actifs" value={k.commerciaux_actifs} />
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 15 }}>Évolution mensuelle — Objectif vs Réalisé ({annee})</h2>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{data.joursEcoules} / {data.joursMois} jours écoulés (mois sélectionné)</span>
            </div>
            <div style={{ width: '100%', height: 300, marginTop: 10 }}>
              <ResponsiveContainer>
                <LineChart data={evoData} margin={{ top: 6, right: 16, left: 6, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={short} width={64} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="Réalisé" stroke="#128a54" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Objectif" stroke="#2554e0" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Performance & classement — {MOIS_COURT[Number(mois.slice(5, 7)) - 1]} {annee}</h2>
            <ExportButtons filename={`dashboard_commerce_${mois}`} columns={exportCols} rows={exportRows} />
          </div>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Rang</th><th>Commercial</th><th>BU</th>
                  <th style={{ textAlign: 'right' }}>Objectif</th><th style={{ textAlign: 'right' }}>Réalisé</th>
                  <th style={{ textAlign: 'right' }}>%</th><th style={{ textAlign: 'right' }}>Écart</th>
                  <th style={{ textAlign: 'right' }}>Moy/jour</th><th style={{ textAlign: 'right' }}>Projection</th><th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.lignes.map(l => (
                  <tr key={l.commercial_id}>
                    <td>{l.rang || '—'}</td>
                    <td><Link to={`/commerce/commerciaux/${l.commercial_id}`}>{l.code} — {l.prenom || ''} {l.nom || ''}</Link></td>
                    <td>{l.business_unit_nom || '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(l.objectif)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(l.realise)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct(l.taux)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: l.ecart < 0 ? '#dc2626' : '#128a54' }}>{money(l.ecart)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(l.moyenne_jour)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(l.projection)}</td>
                    <td><span className="badge" style={{ background: STATUT_COLOR[l.statut], color: '#fff' }}>{l.statut}</span></td>
                  </tr>
                ))}
                {data.lignes.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 20 }}>Aucun commercial.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
