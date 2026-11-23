import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import QhseSubnav from './QhseSubnav';
import { useI18n } from '../../i18n/I18nContext';

const EMPTY = { date_prelevement: '', product_id: '', format_id: '', conditioning_line_id: '', business_unit_id: '', plan_id: '', numero_lot: '', responsable: '' };

// Échantillonnage en ligne (CQ-PR003) : liste + création d'une session de prélèvement rattachée à un
// plan (n/c/m/M). Les prélèvements Début / Milieu / Fin se saisissent dans l'écran détail.
export default function QhseSampling() {
  const { t } = useI18n();
  const [sessions, setSessions] = useState([]);
  const [products, setProducts] = useState([]);
  const [formats, setFormats] = useState([]);
  const [lines, setLines] = useState([]);
  const [bus, setBus] = useState([]);
  const [plans, setPlans] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = () => client.get('/qhse/samplings').then(r => setSessions(r.data)).catch(() => {});
  useEffect(() => {
    load();
    client.get('/products').then(r => setProducts(r.data)).catch(() => {});
    client.get('/qhse/referentials/formats').then(r => setFormats(r.data)).catch(() => {});
    client.get('/qhse/referentials/conditioning-lines').then(r => setLines(r.data)).catch(() => {});
    client.get('/qhse/referentials/sampling-plans').then(r => setPlans(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, []);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function create(e) {
    e.preventDefault(); setErr('');
    try { await client.post('/qhse/samplings', f); setF(EMPTY); setOpen(false); load(); }
    catch (e2) { setErr(e2.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.samp.title')}</h1>
      <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setOpen(o => !o)}>{t('qhse.samp.new')}</button>

      {open && (
        <div className="card" style={{ maxWidth: 740, marginBottom: 14 }}>
          {err && <div className="alert alert-danger">{err}</div>}
          <form onSubmit={create} className="form-grid" style={{ maxWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.samp.date')}
                <input type="date" value={f.date_prelevement} onChange={e => set('date_prelevement', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 150px' }}>BU
                <select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}>
                  <option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select></label>
              <label className="field" style={{ flex: '1 1 200px' }}>{t('qhse.samp.plan')}
                <select value={f.plan_id} onChange={e => set('plan_id', e.target.value)}>
                  <option value="">—</option>{plans.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
                </select></label>
            </div>
            <label className="field">{t('qhse.ana.product')} *
              <SearchableSelect value={f.product_id} onChange={v => set('product_id', v ?? '')} options={products}
                getLabel={p => p.designation} getSearch={p => `${p.designation} ${p.code || ''}`} placeholder={t('qhse.ana.product')} />
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.ana.format')}
                <select value={f.format_id} onChange={e => set('format_id', e.target.value)}>
                  <option value="">—</option>{formats.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
                </select></label>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.prod.ligne')}
                <select value={f.conditioning_line_id} onChange={e => set('conditioning_line_id', e.target.value)}>
                  <option value="">—</option>{lines.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
                </select></label>
              <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.ana.lot')}
                <input value={f.numero_lot} onChange={e => set('numero_lot', e.target.value)} /></label>
            </div>
            <label className="field">{t('qhse.prod.responsable')}
              <input value={f.responsable} onChange={e => set('responsable', e.target.value)} /></label>
            <div><button type="submit" className="btn btn-primary" disabled={!f.product_id}>{t('qhse.samp.create')}</button></div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>N°</th><th>{t('qhse.samp.date')}</th><th>{t('qhse.ana.product')}</th><th>{t('qhse.samp.plan')}</th>
            <th>{t('qhse.samp.count')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id}>
                <td>{s.numero}</td>
                <td>{s.date_prelevement || '—'}</td>
                <td>{s.product_nom || '—'}{s.format_libelle ? ` · ${s.format_libelle}` : ''}</td>
                <td>{s.plan_libelle || '—'}</td>
                <td>{s.nb_prelevements}</td>
                <td>{t('qhse.status.' + s.statut)}</td>
                <td><Link to={`/qhse/echantillonnage/${s.id}`}>{t('qhse.ana.open')}</Link></td>
              </tr>
            ))}
            {sessions.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.samp.none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
