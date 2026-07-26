import { useEffect, useState } from 'react';
import client from '../../api/client';
import PricesSubnav from './PricesSubnav';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';

const DEVISES = ['GNF', 'USD', 'EUR'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function HistoryPage() {
  const [businessUnits, setBusinessUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState({ date_from: '', date_to: '', business_unit_id: '', category_id: '', product_id: '' });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ business_unit_id: '', product_id: '', prix: '', devise: 'GNF', date_effet: today(), commentaire: '' });
  const [formProducts, setFormProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    client.get('/business-units').then(res => setBusinessUnits(res.data));
    client.get('/product-categories').then(res => setCategories(res.data));
  }, []);

  useEffect(() => {
    if (!filters.business_unit_id) { setProducts([]); return; }
    client.get('/products').then(res => {
      setProducts(res.data.filter(p => String(p.business_unit_id) === String(filters.business_unit_id)));
    });
  }, [filters.business_unit_id]);

  useEffect(() => {
    if (!form.business_unit_id) { setFormProducts([]); return; }
    client.get('/products').then(res => {
      setFormProducts(res.data.filter(p => String(p.business_unit_id) === String(form.business_unit_id)));
    });
  }, [form.business_unit_id]);

  function load() {
    setLoading(true);
    const params = {};
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    if (filters.business_unit_id) params.business_unit_id = filters.business_unit_id;
    if (filters.category_id) params.category_id = filters.category_id;
    if (filters.product_id) params.product_id = filters.product_id;
    client.get('/prices/history', { params })
      .then(res => setEntries(res.data))
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement.'))
      .finally(() => setLoading(false));
  }
  useEffect(load, [filters]);

  function setFilter(key, value) {
    setFilters(f => ({
      ...f,
      [key]: value,
      ...(key === 'business_unit_id' ? { product_id: '' } : {}),
    }));
  }

  async function submitPrice(e) {
    e.preventDefault();
    setFormError('');
    if (!form.product_id || form.prix === '') return;
    setSaving(true);
    try {
      await client.post('/prices', {
        productId: Number(form.product_id),
        prix: Number(form.prix),
        devise: form.devise,
        dateEffet: form.date_effet,
        commentaire: form.commentaire || null,
      });
      setForm(f => ({ ...f, prix: '', commentaire: '' }));
      setSavedAt(new Date());
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>Prix</h1>
      <PricesSubnav />

      <div className="form-inline" style={{ marginBottom: 16 }}>
        <label className="field" style={{ minWidth: 140 }}>
          Du
          <input type="date" value={filters.date_from} onChange={e => setFilter('date_from', e.target.value)} />
        </label>
        <label className="field" style={{ minWidth: 140 }}>
          Au
          <input type="date" value={filters.date_to} onChange={e => setFilter('date_to', e.target.value)} />
        </label>
        <label className="field" style={{ minWidth: 170 }}>
          Business Unit
          <select value={filters.business_unit_id} onChange={e => setFilter('business_unit_id', e.target.value)}>
            <option value="">Toutes les BU</option>
            {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 170 }}>
          Catégorie
          <select value={filters.category_id} onChange={e => setFilter('category_id', e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 200 }}>
          Produit
          <select value={filters.product_id} onChange={e => setFilter('product_id', e.target.value)} disabled={!filters.business_unit_id}>
            <option value="">Tous les produits</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="table-wrap">
          {loading ? <Loading /> : entries.length === 0 ? (
            <EmptyState title="Aucun changement de prix ne correspond à ces filtres." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date d'effet</th>
                  <th>Produit</th>
                  <th>Business Unit</th>
                  <th>Prix</th>
                  <th>Commentaire</th>
                  <th>Auteur</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td>{new Date(e.date_effet).toLocaleDateString('fr-FR')}</td>
                    <td>{e.product_designation}{e.product_code ? ` (${e.product_code})` : ''}</td>
                    <td>{e.business_unit_nom || '—'}</td>
                    <td>{Number(e.prix).toLocaleString('fr-FR')} {e.devise}</td>
                    <td>{e.commentaire || '—'}</td>
                    <td>{e.created_by_prenom} {e.created_by_nom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Enregistrer un nouveau prix</h2>
        <form onSubmit={submitPrice} className="form-inline">
          <label className="field" style={{ minWidth: 170 }}>
            Business Unit
            <select value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value, product_id: '' }))}>
              <option value="">Sélectionner…</option>
              {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 220 }}>
            Produit
            <select required value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} disabled={!form.business_unit_id}>
              <option value="">Sélectionner…</option>
              {formProducts.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            Prix
            <input type="number" required value={form.prix} onChange={e => setForm(f => ({ ...f, prix: e.target.value }))} />
          </label>
          <label className="field" style={{ minWidth: 90 }}>
            Devise
            <select value={form.devise} onChange={e => setForm(f => ({ ...f, devise: e.target.value }))}>
              {DEVISES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 150 }}>
            Date d'effet
            <input type="date" required max={today()} value={form.date_effet} onChange={e => setForm(f => ({ ...f, date_effet: e.target.value }))} />
          </label>
          <label className="field" style={{ minWidth: 200 }}>
            Commentaire
            <input value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving || !form.product_id || form.prix === ''}>
            {saving ? '…' : 'Enregistrer'}
          </button>
          {formError && <div className="alert alert-danger" style={{ width: '100%' }}>{formError}</div>}
          {savedAt && <div className="alert alert-success" style={{ width: '100%' }}>Prix enregistré ✓</div>}
        </form>
      </div>
    </div>
  );
}
