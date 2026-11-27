import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const TYPES = ['accident_arret', 'accident_sans_arret', 'presque_accident', 'situation_dangereuse'];
const EMPTY = { date_evenement: '', type_evenement: 'presque_accident', business_unit_id: '', unite_travail: '', lieu: '', description: '', jours_perdus: '' };
const dstr = v => (v ? String(v).slice(0, 10) : '');

export default function QhseSstAccidents() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canEdit = hasSubModuleLevel(user, 'qhse.sst_accidents', 'ajout');
  const [list, setList] = useState([]);
  const [bus, setBus] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = () => client.get('/qhse/sst/accidents').then(r => setList(r.data)).catch(() => {});
  useEffect(() => { load(); client.get('/business-units').then(r => setBus(r.data)).catch(() => {}); }, []);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function create(e) {
    e.preventDefault(); setErr('');
    try { await client.post('/qhse/sst/accidents', f); setF(EMPTY); setOpen(false); load(); }
    catch (e2) { setErr(e2.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.ssta.title')}</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t('qhse.ssta.confidHint')}</p>
      {canEdit && <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setOpen(o => !o)}>{t('qhse.ssta.new')}</button>}

      {open && (
        <div className="card" style={{ maxWidth: 760, marginBottom: 14 }}>
          {err && <div className="alert alert-danger">{err}</div>}
          <form onSubmit={create} className="form-grid" style={{ maxWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.ssta.date')}<input type="date" value={f.date_evenement} onChange={e => set('date_evenement', e.target.value)} /></label>
              <label className="field" style={{ flex: '2 1 220px' }}>{t('qhse.ssta.type')}<select value={f.type_evenement} onChange={e => set('type_evenement', e.target.value)}>{TYPES.map(x => <option key={x} value={x}>{t('qhse.ssttype.' + x)}</option>)}</select></label>
              <label className="field" style={{ flex: '1 1 120px' }}>{t('qhse.ssta.jours')}<input type="number" min="0" value={f.jours_perdus} onChange={e => set('jours_perdus', e.target.value)} /></label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 140px' }}>BU<select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}><option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
              <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.sstr.unite')}<input value={f.unite_travail} onChange={e => set('unite_travail', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.ssta.lieu')}<input value={f.lieu} onChange={e => set('lieu', e.target.value)} /></label>
            </div>
            <label className="field">{t('qhse.ssta.description')} *<textarea rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></label>
            <div><button type="submit" className="btn btn-primary" disabled={!f.description}>{t('qhse.ssta.create')}</button></div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>N°</th><th>{t('qhse.ssta.date')}</th><th>{t('qhse.ssta.type')}</th><th>{t('qhse.sstr.unite')}</th>
            <th>{t('qhse.ssta.jours')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id}>
                <td>{a.numero}</td>
                <td>{dstr(a.date_evenement) || '—'}</td>
                <td>{t('qhse.ssttype.' + a.type_evenement)}</td>
                <td>{a.unite_travail || a.bu_nom || '—'}</td>
                <td>{a.jours_perdus ?? '—'}</td>
                <td>{t('qhse.sstastatut.' + a.statut)}</td>
                <td><Link to={`/qhse/sst/accidents/${a.id}`}>{t('qhse.ana.open')}</Link></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.ssta.none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
