import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import client from '../../api/client';
import StockSectionNav from './StockSectionNav';
import StockSubnav from './StockSubnav';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';

const BU_COLORS = ['#1d4ed8', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];
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
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function pivotByBu(rows) {
  const dateMap = new Map();
  const buNames = [];
  for (const r of rows) {
    if (!buNames.includes(r.business_unit)) buNames.push(r.business_unit);
    const key = String(r.date_stock).slice(0, 10);
    if (!dateMap.has(key)) dateMap.set(key, { date: key });
    dateMap.get(key)[r.business_unit] = r.total;
  }
  const data = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  return { data, buNames };
}

export default function ChartsPage() {
  const [period, setPeriod] = useState('30');
  const [customFrom, setCustomFrom] = useState(daysAgo(30));
  const [customTo, setCustomTo] = useState(today());

  const [businessUnits, setBusinessUnits] = useState([]);
  const [buSeries, setBuSeries] = useState([]);
  const [loadingBu, setLoadingBu] = useState(false);

  const [products, setProducts] = useState([]);
  const [businessUnitId, setBusinessUnitId] = useState('');
  const [productId, setProductId] = useState('');
  const [productSeries, setProductSeries] = useState([]);
  const [loadingProduct, setLoadingProduct] = useState(false);

  const { dateFrom, dateTo } = useMemo(() => {
    if (period === 'custom') return { dateFrom: customFrom, dateTo: customTo };
    return { dateFrom: daysAgo(Number(period)), dateTo: today() };
  }, [period, customFrom, customTo]);

  useEffect(() => {
    client.get('/stock/business-units').then(res => setBusinessUnits(res.data));
  }, []);

  useEffect(() => {
    setLoadingBu(true);
    client.get('/stock/series/by-bu', { params: { date_from: dateFrom, date_to: dateTo } })
      .then(res => setBuSeries(res.data))
      .finally(() => setLoadingBu(false));
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!businessUnitId) { setProducts([]); setProductId(''); return; }
    client.get('/products').then(res => {
      setProducts(res.data.filter(p => String(p.business_unit_id) === String(businessUnitId)));
      setProductId('');
    });
  }, [businessUnitId]);

  useEffect(() => {
    if (!productId) { setProductSeries([]); return; }
    setLoadingProduct(true);
    client.get('/stock/series/by-product', { params: { product_id: productId, date_from: dateFrom, date_to: dateTo } })
      .then(res => setProductSeries(res.data.map(r => ({ date: String(r.date_stock).slice(0, 10), quantite: r.quantite }))))
      .finally(() => setLoadingProduct(false));
  }, [productId, dateFrom, dateTo]);

  const { data: buData, buNames } = useMemo(() => pivotByBu(buSeries), [buSeries]);
  const selectedProduct = products.find(p => String(p.id) === String(productId));

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>Stock</h1>
      <StockSectionNav />
      <StockSubnav />

      <div className="form-inline" style={{ marginBottom: 16 }}>
        {PERIODS.map(p => (
          <button
            key={p.key}
            className={period === p.key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setPeriod(p.key)}
          >
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
      </div>

      <section className="card">
        <h2>Évolution du stock par Business Unit</h2>
        {loadingBu ? <Loading /> : buData.length === 0 ? (
          <EmptyState title="Aucune saisie sur cette période." />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={buData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatTick} />
              <YAxis />
              <Tooltip labelFormatter={formatTick} formatter={v => Number(v).toLocaleString('fr-FR')} />
              <Legend />
              {buNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={BU_COLORS[i % BU_COLORS.length]}
                  connectNulls dot={{ r: 2 }} activeDot={{ r: 5 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Évolution d'un produit</h2>
        <div className="form-inline" style={{ marginBottom: 12 }}>
          <label className="field" style={{ minWidth: 200 }}>
            Business Unit
            <select value={businessUnitId} onChange={e => setBusinessUnitId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 240 }}>
            Produit
            <select value={productId} onChange={e => setProductId(e.target.value)} disabled={!businessUnitId}>
              <option value="">Sélectionner…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
            </select>
          </label>
        </div>

        {!productId ? (
          <EmptyState title="Choisissez un produit pour afficher son évolution." />
        ) : loadingProduct ? <Loading /> : productSeries.length === 0 ? (
          <EmptyState title="Aucune saisie pour ce produit sur cette période." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={productSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatTick} />
              <YAxis />
              <Tooltip labelFormatter={formatTick} formatter={v => Number(v).toLocaleString('fr-FR')} />
              <Legend />
              <Line type="monotone" name={selectedProduct?.designation || 'Quantité'} dataKey="quantite"
                stroke="#1d4ed8" connectNulls dot={{ r: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
