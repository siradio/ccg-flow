import { useEffect, useState } from 'react';
import client from '../../api/client';
import StockSubnav from './StockSubnav';
import Loading from '../../components/Loading';

export default function HistoryPage() {
  const [businessUnits, setBusinessUnits] = useState([]);
  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date: '', business_unit_id: '', product_id: '' });

  useEffect(() => {
    client.get('/stock/business-units').then(res => setBusinessUnits(res.data));
  }, []);

  useEffect(() => {
    if (!filters.business_unit_id) { setProducts([]); return; }
    client.get('/products', { params: {} }).then(res => {
      setProducts(res.data.filter(p => String(p.business_unit_id) === String(filters.business_unit_id)));
    });
  }, [filters.business_unit_id]);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filters.date) params.date = filters.date;
    if (filters.business_unit_id) params.business_unit_id = filters.business_unit_id;
    if (filters.product_id) params.product_id = filters.product_id;
    client.get('/stock/entries', { params }).then(res => setEntries(res.data)).finally(() => setLoading(false));
  }, [filters]);

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value, ...(key === 'business_unit_id' ? { product_id: '' } : {}) }));
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>Stock du Jour</h1>
      <StockSubnav />

      <div className="form-inline" style={{ marginBottom: 16 }}>
        <input type="date" value={filters.date} onChange={e => setFilter('date', e.target.value)} />
        <select value={filters.business_unit_id} onChange={e => setFilter('business_unit_id', e.target.value)}>
          <option value="">Toutes les BU</option>
          {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        <select value={filters.product_id} onChange={e => setFilter('product_id', e.target.value)} disabled={!filters.business_unit_id}>
          <option value="">Tous les produits</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {loading ? <Loading /> : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Business Unit</th>
                  <th>Produit</th>
                  <th>Quantité</th>
                  <th>Auteur</th>
                  <th>Dernière modification</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td>{new Date(e.date_stock).toLocaleDateString('fr-FR')}</td>
                    <td>{e.business_unit_nom}</td>
                    <td>{e.product_designation}{e.product_code ? ` (${e.product_code})` : ''}</td>
                    <td>{Number(e.quantite).toLocaleString('fr-FR')} {e.unite || ''}</td>
                    <td>{e.created_by_prenom} {e.created_by_nom}</td>
                    <td>{new Date(e.updated_at).toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
                {entries.length === 0 && <tr><td className="empty-row" colSpan={6}>Aucune saisie ne correspond à ces filtres.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
