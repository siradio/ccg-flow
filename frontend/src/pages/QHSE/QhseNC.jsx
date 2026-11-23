import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import QhseSubnav from './QhseSubnav';
import { useI18n } from '../../i18n/I18nContext';

const EMPTY = { date_detection: '', detecteur: '', source: '', severity_id: '', business_unit_id: '', product_id: '', numero_lot: '', description: '' };

// Non-conformités / CAPA (IN-CQ06) : liste + ouverture d'une fiche. Le traitement (risque, causes 5M,
// actions, vérification, clôture) se fait dans l'écran détail.
export default function QhseNC() {
  const { t } = useI18n();
  const [list, setList] = useState([]);
  const [severities, setSeverities] = useState([]);
  const [products, setProducts] = useState([]);
  const [bus, setBus] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = () => client.get('/qhse/nonconformities').then(r => setList(r.data)).catch(() => {});
  useEffect(() => {
    load();
    client.get('/qhse/referentials/nc-severities').then(r => setSeverities(r.data)).catch(() => {});
    client.get('/products').then(r => setProducts(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, []);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function create(e) {
    e.preventDefault(); setErr('');
    try { await client.post('/qhse/nonconformities', f); setF(EMPTY); setOpen(false); load(); }
    catch (e2) { setErr(e2.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.nc.title')}</h1>
      <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setOpen(o => !o)}>{t('qhse.nc.new')}</button>

      {open && (
        <div className="card" style={{ maxWidth: 740, marginBottom: 14 }}>
          {err && <div className="alert alert-danger">{err}</div>}
          <form onSubmit={create} className="form-grid" style={{ maxWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.nc.date')}
                <input type="date" value={f.date_detection} onChange={e => set('date_detection', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.nc.detecteur')}
                <input value={f.detecteur} onChange={e => set('detecteur', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.nc.gravite')}
                <select value={f.severity_id} onChange={e => set('severity_id', e.target.value)}>
                  <option value="">—</option>{severities.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
                </select></label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.nc.source')}
                <input value={f.source} onChange={e => set('source', e.target.value)} placeholder={t('qhse.nc.sourceHint')} /></label>
              <label className="field" style={{ flex: '1 1 150px' }}>BU
                <select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}>
                  <option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select></label>
              <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.ana.lot')}
                <input value={f.numero_lot} onChange={e => set('numero_lot', e.target.value)} /></label>
            </div>
            <label className="field">{t('qhse.ana.product')}
              <SearchableSelect value={f.product_id} onChange={v => set('product_id', v ?? '')} options={products}
                getLabel={p => p.designation} getSearch={p => `${p.designation} ${p.code || ''}`} placeholder={t('qhse.ana.product')} />
            </label>
            <label className="field">{t('qhse.nc.description')} *
              <textarea rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></label>
            <div><button type="submit" className="btn btn-primary" disabled={!f.description}>{t('qhse.nc.create')}</button></div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>N°</th><th>{t('qhse.nc.date')}</th><th>{t('qhse.nc.gravite')}</th><th>{t('qhse.ana.product')}</th>
            <th>{t('qhse.nc.capa')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {list.map(n => (
              <tr key={n.id}>
                <td>{n.numero}</td>
                <td>{n.date_detection || '—'}</td>
                <td>{n.severity_libelle || '—'}</td>
                <td>{n.product_nom || '—'}{n.numero_lot ? ` · ${n.numero_lot}` : ''}</td>
                <td>{n.nb_actions_ouvertes > 0 ? `${n.nb_actions_ouvertes}/${n.nb_actions}` : (n.nb_actions || 0)}</td>
                <td>{t('qhse.ncstatut.' + n.statut)}</td>
                <td><Link to={`/qhse/non-conformites/${n.id}`}>{t('qhse.ana.open')}</Link></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.nc.none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
