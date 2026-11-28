import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const EMPTY = { date_inspection: '', inspection_type_id: '', zone: '', business_unit_id: '', responsable: '' };
const dstr = v => (v ? String(v).slice(0, 10) : '');

export default function QhseInspections() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canEdit = hasSubModuleLevel(user, 'qhse.hygiene', 'ajout');
  const [list, setList] = useState([]);
  const [types, setTypes] = useState([]);
  const [bus, setBus] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = () => client.get('/qhse/inspections').then(r => setList(r.data)).catch(() => {});
  useEffect(() => {
    load();
    client.get('/qhse/referentials/inspection-types').then(r => setTypes(r.data.filter(x => x.actif))).catch(() => {});
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, []);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function create(e) {
    e.preventDefault(); setErr('');
    try { await client.post('/qhse/inspections', f); setF(EMPTY); setOpen(false); load(); }
    catch (e2) { setErr(e2.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.hyg.title')}</h1>
      {canEdit && <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setOpen(o => !o)}>{t('qhse.hyg.new')}</button>}

      {open && (
        <div className="card" style={{ maxWidth: 740, marginBottom: 14 }}>
          {err && <div className="alert alert-danger">{err}</div>}
          <form onSubmit={create} className="form-grid" style={{ maxWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.hyg.date')}<input type="date" value={f.date_inspection} onChange={e => set('date_inspection', e.target.value)} /></label>
              <label className="field" style={{ flex: '2 1 220px' }}>{t('qhse.hyg.type')} *
                <select value={f.inspection_type_id} onChange={e => set('inspection_type_id', e.target.value)}>
                  <option value="">—</option>{types.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
                </select></label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.hyg.zone')}<input value={f.zone} onChange={e => set('zone', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 140px' }}>BU<select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}><option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
              <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.hyg.responsable')}<input value={f.responsable} onChange={e => set('responsable', e.target.value)} /></label>
            </div>
            <div><button type="submit" className="btn btn-primary" disabled={!f.inspection_type_id}>{t('qhse.hyg.create')}</button></div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('qhse.hyg.date')}</th><th>{t('qhse.hyg.type')}</th><th>{t('qhse.hyg.zone')}</th><th>BU</th>
            <th>{t('qhse.ana.conformite')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {list.map(i => (
              <tr key={i.id}>
                <td>{dstr(i.date_inspection) || '—'}</td>
                <td>{i.type_libelle || '—'}</td>
                <td>{i.zone || '—'}</td>
                <td>{i.bu_nom || '—'}</td>
                <td>{i.conformite ? t('qhse.conf.' + i.conformite) : '—'}</td>
                <td>{t('qhse.inspstatut.' + i.statut)}</td>
                <td><Link to={`/qhse/inspections/${i.id}`}>{t('qhse.ana.open')}</Link></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.hyg.none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
