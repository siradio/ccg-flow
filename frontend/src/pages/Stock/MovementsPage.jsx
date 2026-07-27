import { useEffect, useState } from 'react';
import client from '../../api/client';
import StockSectionNav from './StockSectionNav';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';

// Base du module Mouvement Stock (§3.9 SPEC.md) — volontairement minimal : une seule page
// (liste + formulaire d'ajout), pas encore de sous-onglets comme Stock du Jour. À enrichir plus
// tard selon les besoins réels (types de mouvement, rapprochement avec le stock du jour, etc.).
const TYPES = [
  { value: 'entree', label: 'Entrée' },
  { value: 'sortie', label: 'Sortie' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function MovementsPage() {
  const [businessUnits, setBusinessUnits] = useState([]);
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState({ business_unit_id: '', product_id: '', type_mouvement: '' });
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    business_unit_id: '', product_id: '', typeMouvement: 'entree', quantite: '',
    dateMouvement: today(), motif: '', referenceDocument: '',
  });
  const [formProducts, setFormProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    client.get('/stock/business-units').then(res => setBusinessUnits(res.data));
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
    if (filters.business_unit_id) params.business_unit_id = filters.business_unit_id;
    if (filters.product_id) params.product_id = filters.product_id;
    if (filters.type_mouvement) params.type_mouvement = filters.type_mouvement;
    client.get('/stock-movements', { params })
      .then(res => setMovements(res.data))
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement.'))
      .finally(() => setLoading(false));
  }
  useEffect(load, [filters]);

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value, ...(key === 'business_unit_id' ? { product_id: '' } : {}) }));
  }

  async function submitMovement(e) {
    e.preventDefault();
    setFormError('');
    if (!form.product_id || form.quantite === '') return;
    setSaving(true);
    try {
      await client.post('/stock-movements', {
        productId: Number(form.product_id),
        typeMouvement: form.typeMouvement,
        quantite: Number(form.quantite),
        dateMouvement: form.dateMouvement,
        motif: form.motif || null,
        referenceDocument: form.referenceDocument || null,
      });
      setForm(f => ({ ...f, quantite: '', motif: '', referenceDocument: '' }));
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
      <h1 className="page-title" style={{ marginBottom: 20 }}>Stock</h1>
      <StockSectionNav />

      <div className="form-inline" style={{ marginBottom: 16 }}>
        <label className="field" style={{ minWidth: 170 }}>
          Business Unit
          <select value={filters.business_unit_id} onChange={e => setFilter('business_unit_id', e.target.value)}>
            <option value="">Toutes les BU</option>
            {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 200 }}>
          Produit
          <select value={filters.product_id} onChange={e => setFilter('product_id', e.target.value)} disabled={!filters.business_unit_id}>
            <option value="">Tous les produits</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 140 }}>
          Type
          <select value={filters.type_mouvement} onChange={e => setFilter('type_mouvement', e.target.value)}>
            <option value="">Tous</option>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="table-wrap">
          {loading ? <Loading /> : movements.length === 0 ? (
            <EmptyState title="Aucun mouvement ne correspond à ces filtres." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Produit</th>
                  <th>Business Unit</th>
                  <th>Quantité</th>
                  <th>Motif</th>
                  <th>Référence</th>
                  <th>Auteur</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id}>
                    <td>{new Date(m.date_mouvement).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <span className="badge" style={{
                        background: m.type_mouvement === 'entree' ? 'var(--color-success-bg)' : 'var(--color-danger-soft)',
                        color: m.type_mouvement === 'entree' ? 'var(--color-success-fg)' : 'var(--color-danger)',
                      }}>
                        {m.type_mouvement === 'entree' ? 'Entrée' : 'Sortie'}
                      </span>
                    </td>
                    <td>{m.product_designation}{m.product_code ? ` (${m.product_code})` : ''}</td>
                    <td>{m.business_unit_nom}</td>
                    <td>{Number(m.quantite).toLocaleString('fr-FR')} {m.product_unite || ''}</td>
                    <td>{m.motif || '—'}</td>
                    <td>{m.reference_document || '—'}</td>
                    <td>{m.created_by_prenom} {m.created_by_nom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Enregistrer un mouvement</h2>
        <form onSubmit={submitMovement} className="form-inline">
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
            Type
            <select value={form.typeMouvement} onChange={e => setForm(f => ({ ...f, typeMouvement: e.target.value }))}>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 100 }}>
            Quantité
            <input type="number" required min="0.01" step="0.01" value={form.quantite} onChange={e => setForm(f => ({ ...f, quantite: e.target.value }))} />
          </label>
          <label className="field" style={{ minWidth: 150 }}>
            Date
            <input type="date" required max={today()} value={form.dateMouvement} onChange={e => setForm(f => ({ ...f, dateMouvement: e.target.value }))} />
          </label>
          <label className="field" style={{ minWidth: 180 }}>
            Motif
            <input value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} placeholder="Réception fournisseur, etc." />
          </label>
          <label className="field" style={{ minWidth: 160 }}>
            Référence document
            <input value={form.referenceDocument} onChange={e => setForm(f => ({ ...f, referenceDocument: e.target.value }))} placeholder="Ex. BC-..." />
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving || !form.product_id || form.quantite === ''}>
            {saving ? '…' : 'Enregistrer'}
          </button>
          {formError && <div className="alert alert-danger" style={{ width: '100%' }}>{formError}</div>}
          {savedAt && <div className="alert alert-success" style={{ width: '100%' }}>Mouvement enregistré ✓</div>}
        </form>
      </div>
    </div>
  );
}
