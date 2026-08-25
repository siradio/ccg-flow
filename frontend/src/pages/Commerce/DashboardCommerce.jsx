import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import CommerceSubnav from './CommerceSubnav';
import { ExportButtons } from '../../utils/exportData';

const money = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' GNF';
const pct = (n) => (n == null ? '—' : n.toLocaleString('fr-FR') + ' %');
const curMonth = () => new Date().toISOString().slice(0, 7);
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
  const [error, setError] = useState('');

  useEffect(() => { client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    setError('');
    const p = new URLSearchParams({ mois });
    if (buId) p.append('business_unit_id', buId);
    client.get('/commerce/dashboard?' + p.toString()).then(r => setData(r.data)).catch(e => setError(e.response?.data?.error || 'Erreur.'));
  }, [mois, buId]);

  const k = data?.kpi;
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
            {bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
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
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            {data.joursEcoules} / {data.joursMois} jours écoulés
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
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
                    <td>{l.code} — {l.prenom || ''} {l.nom || ''}</td>
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
