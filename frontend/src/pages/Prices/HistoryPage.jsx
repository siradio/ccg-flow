import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import PricesSubnav from './PricesSubnav';
import ReferentialsSubnav from '../Referentials/ReferentialsSubnav';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

const DEVISES = ['GNF', 'USD', 'EUR'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function HistoryPage() {
  const confirm = useConfirm();
  const { t, lang } = useI18n();
  const loc = lang === 'en' ? 'en-US' : 'fr-FR';
  const { user } = useAuth();
  const canAdd = hasSubModuleLevel(user, 'referentiels.prix', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'referentiels.prix', 'edition');
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
  const [editingId, setEditingId] = useState(null);

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
      .catch(err => setError(err.response?.data?.error || t('prix.loadError')))
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
      if (editingId) {
        await client.put(`/prices/${editingId}`, {
          prix: Number(form.prix),
          devise: form.devise,
          dateEffet: form.date_effet,
          commentaire: form.commentaire || null,
        });
        setEditingId(null);
        setForm({ business_unit_id: '', product_id: '', prix: '', devise: 'GNF', date_effet: today(), commentaire: '' });
      } else {
        await client.post('/prices', {
          productId: Number(form.product_id),
          prix: Number(form.prix),
          devise: form.devise,
          dateEffet: form.date_effet,
          commentaire: form.commentaire || null,
        });
        setForm(f => ({ ...f, prix: '', commentaire: '' }));
      }
      setSavedAt(new Date());
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || t('prix.saveError'));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setSavedAt(null);
    setFormError('');
    setForm({
      business_unit_id: entry.business_unit_id ? String(entry.business_unit_id) : '',
      product_id: String(entry.product_id),
      prix: String(entry.prix),
      devise: entry.devise,
      date_effet: String(entry.date_effet).slice(0, 10),
      commentaire: entry.commentaire || '',
    });
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setFormError('');
    setForm({ business_unit_id: '', product_id: '', prix: '', devise: 'GNF', date_effet: today(), commentaire: '' });
  }

  async function deleteEntry(id) {
    if (!(await confirm(t('prix.confirmDelete'), { danger: true, confirmLabel: t('common.delete') }))) return;
    await client.delete(`/prices/${id}`);
    load();
  }

  return (
    <div>
      <ReferentialsSubnav />
      <h1 className="page-title" style={{ marginBottom: 20 }}>{t('refx.nav.prices')}</h1>
      <PricesSubnav />

      <div className="form-inline" style={{ marginBottom: 16 }}>
        <label className="field" style={{ minWidth: 140 }}>
          {t('mvt.from')}
          <input type="date" value={filters.date_from} onChange={e => setFilter('date_from', e.target.value)} />
        </label>
        <label className="field" style={{ minWidth: 140 }}>
          {t('mvt.to')}
          <input type="date" value={filters.date_to} onChange={e => setFilter('date_to', e.target.value)} />
        </label>
        <label className="field" style={{ minWidth: 170 }}>
          {t('stockreleve.bu')}
          <select value={filters.business_unit_id} onChange={e => setFilter('business_unit_id', e.target.value)}>
            <option value="">{t('cockpit.allBu')}</option>
            {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 170 }}>
          {t('val.cat')}
          <select value={filters.category_id} onChange={e => setFilter('category_id', e.target.value)}>
            <option value="">{t('prix.allCategories')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 200 }}>
          {t('cockpit.th.product')}
          <select value={filters.product_id} onChange={e => setFilter('product_id', e.target.value)} disabled={!filters.business_unit_id}>
            <option value="">{t('prix.allProducts')}</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="table-wrap">
          {loading ? <Loading /> : entries.length === 0 ? (
            <EmptyState title={t('prix.noChanges')} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('prix.th.effectiveDate')}</th>
                  <th>{t('cockpit.th.product')}</th>
                  <th>{t('stockreleve.bu')}</th>
                  <th>{t('prix.th.price')}</th>
                  <th>{t('fields.comment')}</th>
                  <th>{t('prix.th.author')}</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td>{new Date(e.date_effet).toLocaleDateString(loc)}</td>
                    <td>{e.product_designation}{e.product_code ? ` (${e.product_code})` : ''}</td>
                    <td>{e.business_unit_nom || '—'}</td>
                    <td>{Number(e.prix).toLocaleString(loc)} {e.devise}</td>
                    <td>{e.commentaire || '—'}</td>
                    <td>{e.created_by_prenom} {e.created_by_nom}</td>
                    {canEdit && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button onClick={() => startEdit(e)} className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}>{t('common.edit')}</button>
                        <button onClick={() => deleteEntry(e.id)} className="btn btn-danger btn-sm">{t('common.delete')}</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {canAdd && (
      <div className="card">
        <h2>{editingId ? t('prix.editPrice') : t('prix.newPrice')}</h2>
        <form onSubmit={submitPrice} className="form-inline">
          <label className="field" style={{ minWidth: 170 }}>
            {t('stockreleve.bu')}
            <select value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value, product_id: '' }))} disabled={!!editingId}>
              <option value="">{t('prc.select')}</option>
              {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 220 }}>
            {t('cockpit.th.product')}
            <select required value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} disabled={!form.business_unit_id || !!editingId}>
              <option value="">{t('prc.select')}</option>
              {formProducts.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            {t('prix.th.price')}
            <input type="number" required value={form.prix} onChange={e => setForm(f => ({ ...f, prix: e.target.value }))} />
          </label>
          <label className="field" style={{ minWidth: 90 }}>
            {t('prd.currency')}
            <select value={form.devise} onChange={e => setForm(f => ({ ...f, devise: e.target.value }))}>
              {DEVISES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 150 }}>
            {t('prix.th.effectiveDate')}
            <input type="date" required max={today()} value={form.date_effet} onChange={e => setForm(f => ({ ...f, date_effet: e.target.value }))} />
          </label>
          <label className="field" style={{ minWidth: 200 }}>
            {t('fields.comment')}
            <input value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving || !form.product_id || form.prix === ''}>
            {saving ? '…' : editingId ? t('prix.saveChanges') : t('common.save')}
          </button>
          {editingId && <button type="button" onClick={cancelEdit} className="btn btn-secondary">{t('common.cancel')}</button>}
          {formError && <div className="alert alert-danger" style={{ width: '100%' }}>{formError}</div>}
          {savedAt && <div className="alert alert-success" style={{ width: '100%' }}>{t('prix.saved')}</div>}
        </form>
      </div>
      )}
    </div>
  );
}
