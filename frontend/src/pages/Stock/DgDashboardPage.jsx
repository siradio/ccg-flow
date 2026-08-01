import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import client from '../../api/client';
import StockSectionNav from './StockSectionNav';
import StockSubnav from './StockSubnav';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';

const PERIODS = [
  { key: '7', label: '7 jours' },
  { key: '30', label: '30 jours' },
  { key: '90', label: '90 jours' },
  { key: 'custom', label: 'Personnalisé' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatTick(dateStr) {
  const [, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${d}/${m}`;
}

function fmt(n) {
  return n == null ? '—' : Math.round(n).toLocaleString('fr-FR');
}

function TrendArrow({ deltaAbs }) {
  if (deltaAbs == null) return <span style={{ color: 'var(--color-text-muted)' }}>→</span>;
  if (deltaAbs > 0) return <span style={{ color: 'var(--color-success-fg)' }}>▲</span>;
  if (deltaAbs < 0) return <span style={{ color: 'var(--color-danger)' }}>▼</span>;
  return <span style={{ color: 'var(--color-text-muted)' }}>→</span>;
}

function deltaLabel(row) {
  if (row.deltaAbs == null) return "Pas d'historique antérieur";
  const sign = row.deltaAbs > 0 ? '+' : '';
  const pct = row.deltaPct != null ? ` (${sign}${Math.round(row.deltaPct * 100)}%)` : '';
  return `${sign}${fmt(row.deltaAbs)}${pct} vs jour précédent`;
}

function buStatusColor(buId, data) {
  const hasRupture = data.rupture.some(r => r.business_unit_id === buId);
  if (hasRupture) return { bg: 'var(--color-danger-soft)', dot: 'var(--color-danger)' };
  const hasSeuilBas = data.seuilBas.some(r => r.business_unit_id === buId);
  if (hasSeuilBas) return { bg: 'var(--color-warning-bg)', dot: '#d97706' };
  return { bg: 'var(--color-success-bg)', dot: 'var(--color-success-fg)' };
}

export default function DgDashboardPage() {
  const [period, setPeriod] = useState('30');
  const [customFrom, setCustomFrom] = useState(daysAgo(30));
  const [customTo, setCustomTo] = useState(today());

  const [businessUnits, setBusinessUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [businessUnitId, setBusinessUnitId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const { dateFrom, dateTo } = useMemo(() => {
    if (period === 'custom') return { dateFrom: customFrom, dateTo: customTo };
    return { dateFrom: daysAgo(Number(period)), dateTo: today() };
  }, [period, customFrom, customTo]);

  useEffect(() => {
    client.get('/stock/business-units').then(res => setBusinessUnits(res.data));
    client.get('/product-categories').then(res => setCategories(res.data));
  }, []);

  useEffect(() => {
    if (!businessUnitId) { setProducts([]); setProductId(''); return; }
    client.get('/products').then(res => {
      setProducts(res.data.filter(p => String(p.business_unit_id) === String(businessUnitId)));
    });
  }, [businessUnitId]);

  useEffect(() => {
    setLoading(true);
    client.get('/stock/dashboard', {
      params: {
        date_from: dateFrom,
        date_to: dateTo,
        business_unit_id: businessUnitId || undefined,
        category_id: categoryId || undefined,
        product_id: productId || undefined,
      },
    }).then(res => setData(res.data)).finally(() => setLoading(false));
  }, [dateFrom, dateTo, businessUnitId, categoryId, productId]);

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>Stock</h1>
      <StockSectionNav />
      <StockSubnav />

      <div className="form-inline" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button key={p.key} className={period === p.key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <>
            <label className="field" style={{ minWidth: 140 }}>
              Du
              <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)} />
            </label>
            <label className="field" style={{ minWidth: 140 }}>
              Au
              <input type="date" value={customTo} max={today()} onChange={e => setCustomTo(e.target.value)} />
            </label>
          </>
        )}
        <label className="field" style={{ minWidth: 170 }}>
          Business Unit
          <select value={businessUnitId} onChange={e => { setBusinessUnitId(e.target.value); setProductId(''); }}>
            <option value="">Toutes les BU</option>
            {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 170 }}>
          Catégorie
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 200 }}>
          Produit
          <select value={productId} onChange={e => setProductId(e.target.value)} disabled={!businessUnitId}>
            <option value="">Tous les produits</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
          </select>
        </label>
      </div>

      {loading ? <div className="card"><Loading /></div> : !data || !data.asOf ? (
        <div className="card"><EmptyState title="Aucune saisie de stock ne correspond à ces filtres." /></div>
      ) : (
        <>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 12 }}>
            Situation à jour au {new Date(data.asOf).toLocaleDateString('fr-FR')}
            {data.previousAsOf && ` — comparée au ${new Date(data.previousAsOf).toLocaleDateString('fr-FR')}`}
          </p>

          <div className="kpi-grid">
            <div className="card kpi-card">
              <div className="kpi-value"><TrendArrow deltaAbs={data.global.deltaAbs} /> {fmt(data.global.total)}</div>
              <div className="kpi-label">Stock global</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{deltaLabel(data.global)}</div>
            </div>
            <div className="card kpi-card" style={{ background: data.rupture.length > 0 ? 'var(--color-danger-soft)' : undefined }}>
              <div className="kpi-value">{data.rupture.length}</div>
              <div className="kpi-label">Produits en rupture</div>
            </div>
            <div className="card kpi-card" style={{ background: data.seuilBas.length > 0 ? 'var(--color-warning-bg)' : undefined }}>
              <div className="kpi-value">{data.seuilBas.length}</div>
              <div className="kpi-label">Produits sous le seuil</div>
            </div>
            <div className="card kpi-card">
              <div className="kpi-value">{data.byBu.filter(b => b.total > 0).length}/{data.byBu.length}</div>
              <div className="kpi-label">Business Units actives</div>
            </div>
          </div>

          <div className="dashboard-section-title">Comparaison par Business Unit</div>
          <div className="kpi-grid">
            {data.byBu.map(bu => {
              const status = buStatusColor(bu.business_unit_id, data);
              return (
                <div key={bu.business_unit_id} className="card kpi-card" style={{ background: status.bg, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: status.dot, display: 'inline-block' }} />
                    <strong>{bu.business_unit}</strong>
                  </div>
                  <div className="kpi-value" style={{ textAlign: 'left', marginTop: 8 }}>
                    <TrendArrow deltaAbs={bu.deltaAbs} /> {fmt(bu.total)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{deltaLabel(bu)}</div>
                </div>
              );
            })}
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <h2>Évolution du stock global</h2>
            {data.evolution.length === 0 ? <EmptyState title="Aucune saisie sur cette période." /> : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.evolution.map(e => ({ date: String(e.date_stock).slice(0, 10), total: e.total }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatTick} />
                  <YAxis />
                  <Tooltip labelFormatter={formatTick} formatter={v => Number(v).toLocaleString('fr-FR')} />
                  <Area type="monotone" dataKey="total" stroke="#2454e0" fill="#2454e022" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </section>

          <div className="dashboard-section-title">Stock du jour — détail par Business Unit</div>
          {data.byBuProducts.map(bu => (
            <section key={bu.business_unit_id} className="card" style={{ marginBottom: 16 }}>
              <h2>{bu.business_unit}</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Produit</th><th>Quantité</th><th>Unité</th><th>Dernière saisie</th></tr></thead>
                  <tbody>
                    {bu.products.map(p => {
                      const qty = p.quantite != null ? Number(p.quantite) : null;
                      const rowStyle = qty === 0
                        ? { background: 'var(--color-danger-soft)' }
                        : (p.seuil_alerte_stock != null && qty != null && qty < Number(p.seuil_alerte_stock))
                          ? { background: 'var(--color-warning-bg)' }
                          : undefined;
                      return (
                        <tr key={p.product_id} style={rowStyle}>
                          <td>{p.designation}{p.code ? ` (${p.code})` : ''}</td>
                          <td>{qty != null ? fmt(qty) : '—'}</td>
                          <td>{p.unite || '—'}</td>
                          <td>{p.date_stock ? new Date(p.date_stock).toLocaleDateString('fr-FR') : 'Jamais saisi'}</td>
                        </tr>
                      );
                    })}
                    {bu.products.length === 0 && <tr><td className="empty-row" colSpan={4}>Aucun produit actif pour cette BU.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <div className="dashboard-columns" style={{ marginTop: 16 }}>
            <section className="card">
              <h2>Top 10 des plus fortes baisses (sur la période)</h2>
              {data.topDrops.length === 0 ? <p className="empty-row">Aucune baisse notable.</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Produit</th><th>BU</th><th>Variation</th></tr></thead>
                    <tbody>
                      {data.topDrops.map(r => (
                        <tr key={r.product_id} style={{ background: 'var(--color-danger-soft)' }}>
                          <td>{r.designation}</td>
                          <td>{r.business_unit}</td>
                          <td>{fmt(r.delta_abs)} ({fmt(r.start_qty)} → {fmt(r.end_qty)})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <h2>Top 10 des stocks les plus élevés</h2>
              {data.topStock.length === 0 ? <p className="empty-row">Aucune donnée.</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Produit</th><th>BU</th><th>Quantité</th></tr></thead>
                    <tbody>
                      {data.topStock.map(r => (
                        <tr key={r.product_id}>
                          <td>{r.designation}</td>
                          <td>{r.business_unit}</td>
                          <td>{fmt(r.quantite)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
