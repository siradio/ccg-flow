import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import QhseSubnav from './QhseSubnav';
import { useI18n } from '../../i18n/I18nContext';
import { ConfBadge } from './qhseConformite';

const EMPTY = { date_controle: '', business_unit_id: '', destination: '', transporteur: '', vehicule: '', product_id: '', numero_lot: '', responsable: '' };

// Contrôle des expéditions (ENR-CQ03) : liste + création. Les points de contrôle se saisissent dans
// l'écran détail.
export default function QhseShipments() {
  const { t } = useI18n();
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [bus, setBus] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = () => client.get('/qhse/shipments').then(r => setList(r.data)).catch(() => {});
  useEffect(() => {
    load();
    client.get('/products').then(r => setProducts(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, []);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function create(e) {
    e.preventDefault(); setErr('');
    try { await client.post('/qhse/shipments', f); setF(EMPTY); setOpen(false); load(); }
    catch (e2) { setErr(e2.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.exp.title')}</h1>
      <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setOpen(o => !o)}>{t('qhse.exp.new')}</button>

      {open && (
        <div className="card" style={{ maxWidth: 740, marginBottom: 14 }}>
          {err && <div className="alert alert-danger">{err}</div>}
          <form onSubmit={create} className="form-grid" style={{ maxWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.prod.date')}
                <input type="date" value={f.date_controle} onChange={e => set('date_controle', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 150px' }}>BU
                <select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}>
                  <option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select></label>
              <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.exp.destination')}
                <input value={f.destination} onChange={e => set('destination', e.target.value)} /></label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.exp.transporteur')}
                <input value={f.transporteur} onChange={e => set('transporteur', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.exp.vehicule')}
                <input value={f.vehicule} onChange={e => set('vehicule', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.ana.lot')}
                <input value={f.numero_lot} onChange={e => set('numero_lot', e.target.value)} /></label>
            </div>
            <label className="field">{t('qhse.ana.product')}
              <SearchableSelect value={f.product_id} onChange={v => set('product_id', v ?? '')} options={products}
                getLabel={p => p.designation} getSearch={p => `${p.designation} ${p.code || ''}`} placeholder={t('qhse.ana.product')} />
            </label>
            <label className="field">{t('qhse.prod.responsable')}
              <input value={f.responsable} onChange={e => set('responsable', e.target.value)} /></label>
            <div><button type="submit" className="btn btn-primary">{t('qhse.exp.create')}</button></div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>N°</th><th>{t('qhse.prod.date')}</th><th>{t('qhse.exp.destination')}</th><th>{t('qhse.exp.transporteur')}</th>
            <th>{t('qhse.ana.conf')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id}>
                <td>{c.numero}</td>
                <td>{c.date_controle || '—'}</td>
                <td>{c.destination || '—'}</td>
                <td>{c.transporteur || '—'}</td>
                <td><ConfBadge value={c.conformite} t={t} /></td>
                <td>{t('qhse.status.' + c.statut)}</td>
                <td><Link to={`/qhse/expeditions/${c.id}`}>{t('qhse.ana.open')}</Link></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.exp.none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
