import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import client from '../../api/client';
import PricesSubnav from './PricesSubnav';
import ReferentialsSubnav from '../Referentials/ReferentialsSubnav';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';

const PERIODS = [
  { key: '90', label: '3 mois' },
  { key: '365', label: '12 mois' },
  { key: 'all', label: 'Tout' },
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
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

export default function ChartPage() {
  const [period, setPeriod] = useState('365');
  const [customFrom, setCustomFrom] = useState(daysAgo(365));
  const [customTo, setCustomTo] = useState(today());

  const [businessUnits, setBusinessUnits] = useState([]);
  const [products, setProducts] = useState([]);
  const [businessUnitId, setBusinessUnitId] = useState('');
  const [productId, setProductId] = useState('');
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);

  const { dateFrom, dateTo } = useMemo(() => {
    if (period === 'all') return { dateFrom: null, dateTo: null };
    if (period === 'custom') return { dateFrom: customFrom, dateTo: customTo };
    return { dateFrom: daysAgo(Number(period)), dateTo: today() };
  }, [period, customFrom, customTo]);

  useEffect(() => {
    client.get('/business-units').then(res => setBusinessUnits(res.data));
  }, []);

  useEffect(() => {
    if (!businessUnitId) { setProducts([]); setProductId(''); return; }
    client.get('/products').then(res => {
      setProducts(res.data.filter(p => String(p.business_unit_id) === String(businessUnitId)));
    });
  }, [businessUnitId]);

  useEffect(() => {
    if (!productId) { setSeries([]); return; }
    setLoading(true);
    const params = { product_id: productId };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    client.get('/prices/series', { params })
      .then(res => setSeries(res.data.map(r => ({ date: String(r.date_effet).slice(0, 10), prix: r.prix, devise: r.devise }))))
      .finally(() => setLoading(false));
  }, [productId, dateFrom, dateTo]);

  const selectedProduct = products.find(p => String(p.id) === String(productId));
  const devise = series[0]?.devise;

  return (
    <div>
      <ReferentialsSubnav />
      <h1 className="page-title" style={{ marginBottom: 20 }}>Prix</h1>
      <PricesSubnav />

      <div className="form-inline" style={{ marginBottom: 16 }}>
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
      </div>

      <div className="form-inline" style={{ marginBottom: 16 }}>
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

      <section className="card">
        <h2>{selectedProduct ? `Évolution du prix — ${selectedProduct.designation}` : 'Évolution du prix'}</h2>
        {!productId ? (
          <EmptyState title="Choisissez un produit pour afficher l'évolution de son prix." />
        ) : loading ? <Loading /> : series.length === 0 ? (
          <EmptyState title="Aucun prix enregistré pour ce produit sur cette période." />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatTick} />
              <YAxis />
              <Tooltip labelFormatter={formatTick} formatter={v => `${Number(v).toLocaleString('fr-FR')} ${devise || ''}`} />
              <Legend />
              <Line type="stepAfter" name={`Prix (${devise || ''})`} dataKey="prix" stroke="#2454e0" connectNulls dot={{ r: 3 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
