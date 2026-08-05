import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';

// Refonte Stock (Lot 1) — Tableau de bord de base, calculé à partir du solde dérivé et des
// derniers mouvements. Le tableau de bord DG complet sera reconstruit sur cette base (Lot 2+).
const fmt = n => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
const STATUT_STYLE = { Alerte: '#b45309', Critique: '#c2410c', Rupture: '#b91c1c', Surstock: '#1d4ed8' };
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');

function Kpi({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '12px 16px', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'inherit', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

export default function StockTableauBord() {
  const { user } = useAuth();
  const canView = hasSubModuleLevel(user, 'stock.tableau_bord');
  const [stock, setStock] = useState([]);
  const [mvts, setMvts] = useState([]);

  useEffect(() => {
    if (!canView) return;
    client.get('/stock-actuel').then(r => setStock(r.data)).catch(() => {});
    client.get('/stock-mouvements').then(r => setMvts(r.data.slice(0, 8))).catch(() => {});
  }, [canView]);

  const kpi = useMemo(() => {
    const valeur = stock.reduce((s, r) => s + (Number(r.valeur_stock) || 0), 0);
    const count = st => stock.filter(r => r.statut === st).length;
    return { lignes: stock.length, valeur, alerte: count('Alerte') + count('Critique'), rupture: count('Rupture'), surstock: count('Surstock') };
  }, [stock]);

  const valeurParBu = useMemo(() => {
    const m = {};
    stock.forEach(r => { const k = r.bu_nom || '—'; m[k] = (m[k] || 0) + (Number(r.valeur_stock) || 0); });
    return Object.entries(m).map(([bu, valeur]) => ({ bu, valeur })).sort((a, b) => b.valeur - a.valeur);
  }, [stock]);

  const alertes = useMemo(() => stock.filter(r => ['Alerte', 'Critique', 'Rupture'].includes(r.statut))
    .sort((a, b) => Number(a.stock_actuel) - Number(b.stock_actuel)).slice(0, 10), [stock]);

  if (!canView) return <div><StockSectionNav /><p>Le tableau de bord Stock ne vous a pas été accordé.</p></div>;

  return (
    <div>
      <StockSectionNav />
      <h1 className="page-title" style={{ margin: '0 0 4px' }}>Tableau de bord Stock</h1>
      <p className="page-subtitle" style={{ margin: '0 0 12px' }}>Vue synthétique du stock (soldes dérivés des mouvements).</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Kpi label="Lignes de stock" value={fmt(kpi.lignes)} />
        <Kpi label="Valeur totale (GNF)" value={fmt(kpi.valeur)} />
        <Kpi label="En alerte" value={fmt(kpi.alerte)} color={STATUT_STYLE.Alerte} />
        <Kpi label="En rupture" value={fmt(kpi.rupture)} color={STATUT_STYLE.Rupture} />
        <Kpi label="En surstock" value={fmt(kpi.surstock)} color={STATUT_STYLE.Surstock} />
      </div>

      {stock.length === 0 && <p className="empty-row">Aucune donnée de stock — enregistrez des mouvements pour alimenter le tableau de bord.</p>}

      {valeurParBu.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Valeur du stock par Business Unit</h2>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={valeurParBu} margin={{ top: 6, right: 10, bottom: 6, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="bu" fontSize={12} />
                <YAxis fontSize={11} tickFormatter={fmt} width={70} />
                <Tooltip formatter={v => fmt(v) + ' GNF'} />
                <Bar dataKey="valeur" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <section className="card">
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Produits en alerte</h2>
          {alertes.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>Aucune alerte 🎉</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Produit</th><th className="num">Stock</th><th>Statut</th></tr></thead>
              <tbody>{alertes.map(r => (
                <tr key={`${r.product_id}-${r.location_id}`}><td>{r.designation}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.stock_actuel)}</td>
                  <td><span style={{ color: STATUT_STYLE[r.statut], fontWeight: 700 }}>{r.statut}</span></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>

        <section className="card">
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Derniers mouvements</h2>
          {mvts.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>Aucun mouvement.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Réf.</th><th>Date</th><th>Type</th><th className="num">Qté</th></tr></thead>
              <tbody>{mvts.map(m => (
                <tr key={m.id}><td>{m.reference}</td><td>{d10(m.date_mouvement)}</td>
                  <td style={{ color: m.sens === 'entree' ? '#15803d' : m.sens === 'sortie' ? '#b91c1c' : '#6b7280' }}>{m.type_libelle}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(m.total_quantite)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </div>
  );
}
