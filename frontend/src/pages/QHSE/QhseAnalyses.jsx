import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import QhseSubnav from './QhseSubnav';
import { useI18n } from '../../i18n/I18nContext';

const EMPTY = { product_id: '', format_id: '', business_unit_id: '', numero_lot: '', nature: '', dp: '', de: '', motif: '' };

// Liste des échantillons de laboratoire + création. Un échantillon porte ensuite une ou plusieurs
// analyses (écran détail). Lot 1 — démarrage physico-chimique.
export default function QhseAnalyses() {
  const { t } = useI18n();
  const [samples, setSamples] = useState([]);
  const [products, setProducts] = useState([]);
  const [formats, setFormats] = useState([]);
  const [bus, setBus] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = () => client.get('/qhse/analyses/samples').then(r => setSamples(r.data)).catch(() => {});
  useEffect(() => {
    load();
    client.get('/products').then(r => setProducts(r.data)).catch(() => {});
    client.get('/qhse/referentials/formats').then(r => setFormats(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, []);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function create(e) {
    e.preventDefault(); setErr('');
    try { await client.post('/qhse/analyses/samples', f); setF(EMPTY); setOpen(false); load(); }
    catch (e2) { setErr(e2.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.ana.title')}</h1>
      <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setOpen(o => !o)}>{t('qhse.ana.newSample')}</button>

      {open && (
        <div className="card" style={{ maxWidth: 700, marginBottom: 14 }}>
          {err && <div className="alert alert-danger">{err}</div>}
          <form onSubmit={create} className="form-grid" style={{ maxWidth: 'none' }}>
            <label className="field">{t('qhse.ana.product')} *
              <SearchableSelect value={f.product_id} onChange={v => set('product_id', v ?? '')} options={products}
                getLabel={p => p.designation} getSearch={p => `${p.designation} ${p.code || ''}`} placeholder={t('qhse.ana.product')} />
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.ana.format')}
                <select value={f.format_id} onChange={e => set('format_id', e.target.value)}>
                  <option value="">—</option>{formats.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
                </select></label>
              <label className="field" style={{ flex: '1 1 160px' }}>BU
                <select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}>
                  <option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select></label>
              <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.ana.lot')}
                <input value={f.numero_lot} onChange={e => set('numero_lot', e.target.value)} /></label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.ana.nature')}
                <input value={f.nature} onChange={e => set('nature', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 120px' }}>DP
                <input type="date" value={f.dp} onChange={e => set('dp', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 120px' }}>DE
                <input type="date" value={f.de} onChange={e => set('de', e.target.value)} /></label>
            </div>
            <label className="field">{t('qhse.ana.motif')}
              <input value={f.motif} onChange={e => set('motif', e.target.value)} /></label>
            <div><button type="submit" className="btn btn-primary" disabled={!f.product_id}>{t('qhse.ana.createSample')}</button></div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>N°</th><th>{t('qhse.ana.product')}</th><th>{t('qhse.ana.lot')}</th><th>{t('qhse.ana.analyses')}</th><th></th></tr></thead>
          <tbody>
            {samples.map(s => (
              <tr key={s.id}>
                <td>{s.numero}</td>
                <td>{s.product_nom || s.nature || '—'}{s.format_libelle ? ` · ${s.format_libelle}` : ''}</td>
                <td>{s.numero_lot || '—'}</td>
                <td>{s.nb_analyses}</td>
                <td><Link to={`/qhse/analyses/echantillon/${s.id}`}>{t('qhse.ana.open')}</Link></td>
              </tr>
            ))}
            {samples.length === 0 && <tr><td colSpan={5} className="empty-row">{t('qhse.ana.none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
