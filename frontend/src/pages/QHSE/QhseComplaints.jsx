import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import QhseSubnav from './QhseSubnav';
import { useI18n } from '../../i18n/I18nContext';

const EMPTY = { date_reclamation: '', client: '', canal: '', type_reclamation: '', severity_id: '', business_unit_id: '', product_id: '', numero_lot: '', description: '' };

// Réclamations et retours clients (QUA-08) : liste + ouverture d'une fiche. Investigation, réponse,
// actions et clôture dans l'écran détail.
export default function QhseComplaints() {
  const { t } = useI18n();
  const [list, setList] = useState([]);
  const [severities, setSeverities] = useState([]);
  const [products, setProducts] = useState([]);
  const [bus, setBus] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = () => client.get('/qhse/complaints').then(r => setList(r.data)).catch(() => {});
  useEffect(() => {
    load();
    client.get('/qhse/referentials/nc-severities').then(r => setSeverities(r.data)).catch(() => {});
    client.get('/products').then(r => setProducts(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, []);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function create(e) {
    e.preventDefault(); setErr('');
    try { await client.post('/qhse/complaints', f); setF(EMPTY); setOpen(false); load(); }
    catch (e2) { setErr(e2.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.cmp.title')}</h1>
      <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setOpen(o => !o)}>{t('qhse.cmp.new')}</button>

      {open && (
        <div className="card" style={{ maxWidth: 760, marginBottom: 14 }}>
          {err && <div className="alert alert-danger">{err}</div>}
          <form onSubmit={create} className="form-grid" style={{ maxWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.cmp.date')}
                <input type="date" value={f.date_reclamation} onChange={e => set('date_reclamation', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.cmp.client')} *
                <input value={f.client} onChange={e => set('client', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.cmp.canal')}
                <input value={f.canal} onChange={e => set('canal', e.target.value)} placeholder={t('qhse.cmp.canalHint')} /></label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.cmp.type')}
                <input value={f.type_reclamation} onChange={e => set('type_reclamation', e.target.value)} placeholder={t('qhse.cmp.typeHint')} /></label>
              <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.nc.gravite')}
                <select value={f.severity_id} onChange={e => set('severity_id', e.target.value)}>
                  <option value="">—</option>{severities.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
                </select></label>
              <label className="field" style={{ flex: '1 1 140px' }}>BU
                <select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}>
                  <option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select></label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '2 1 260px' }}>{t('qhse.ana.product')}
                <SearchableSelect value={f.product_id} onChange={v => set('product_id', v ?? '')} options={products}
                  getLabel={p => p.designation} getSearch={p => `${p.designation} ${p.code || ''}`} placeholder={t('qhse.ana.product')} /></label>
              <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.ana.lot')}
                <input value={f.numero_lot} onChange={e => set('numero_lot', e.target.value)} /></label>
            </div>
            <label className="field">{t('qhse.cmp.description')} *
              <textarea rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></label>
            <div><button type="submit" className="btn btn-primary" disabled={!f.client || !f.description}>{t('qhse.cmp.create')}</button></div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>N°</th><th>{t('qhse.cmp.date')}</th><th>{t('qhse.cmp.client')}</th><th>{t('qhse.ana.product')}</th>
            <th>{t('qhse.nc.gravite')}</th><th>{t('qhse.nc.capa')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id}>
                <td>{c.numero}</td>
                <td>{c.date_reclamation || '—'}</td>
                <td>{c.client || '—'}</td>
                <td>{c.product_nom || '—'}{c.numero_lot ? ` · ${c.numero_lot}` : ''}</td>
                <td>{c.severity_libelle || '—'}</td>
                <td>{c.nb_actions_ouvertes > 0 ? `${c.nb_actions_ouvertes}/${c.nb_actions}` : (c.nb_actions || 0)}</td>
                <td>{t('qhse.cmpstatut.' + c.statut)}</td>
                <td><Link to={`/qhse/reclamations/${c.id}`}>{t('qhse.ana.open')}</Link></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={8} className="empty-row">{t('qhse.cmp.none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
