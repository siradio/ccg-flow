import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const EMPTY = { code: '', libelle: '', type: '', localisation: '', business_unit_id: '', criticite: '', frequence_mois: '', statut: 'en_service' };
const dstr = v => (v ? String(v).slice(0, 10) : '');

// Échéance : en retard (< aujourd'hui), bientôt (≤ 30 j), sinon ok.
function dueState(d) {
  if (!d) return null;
  const days = Math.round((new Date(dstr(d) + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5);
  if (days < 0) return 'late'; if (days <= 30) return 'soon'; return 'ok';
}

export default function QhseEquipment() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canEdit = hasSubModuleLevel(user, 'qhse.equipment', 'ajout');
  const [list, setList] = useState([]);
  const [bus, setBus] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = () => client.get('/qhse/equipment').then(r => setList(r.data)).catch(() => {});
  useEffect(() => { load(); client.get('/business-units').then(r => setBus(r.data)).catch(() => {}); }, []);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function create(e) {
    e.preventDefault(); setErr('');
    try { await client.post('/qhse/equipment', f); setF(EMPTY); setOpen(false); load(); }
    catch (e2) { setErr(e2.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.eq.title')}</h1>
      {canEdit && <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setOpen(o => !o)}>{t('qhse.eq.new')}</button>}

      {open && (
        <div className="card" style={{ maxWidth: 760, marginBottom: 14 }}>
          {err && <div className="alert alert-danger">{err}</div>}
          <form onSubmit={create} className="form-grid" style={{ maxWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 120px' }}>{t('qhse.eq.code')}<input value={f.code} onChange={e => set('code', e.target.value)} /></label>
              <label className="field" style={{ flex: '2 1 220px' }}>{t('qhse.eq.libelle')} *<input value={f.libelle} onChange={e => set('libelle', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.eq.type')}<input value={f.type} onChange={e => set('type', e.target.value)} placeholder={t('qhse.eq.typeHint')} /></label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.eq.localisation')}<input value={f.localisation} onChange={e => set('localisation', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 140px' }}>BU
                <select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}><option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
              <label className="field" style={{ flex: '1 1 130px' }}>{t('qhse.eq.criticite')}
                <select value={f.criticite} onChange={e => set('criticite', e.target.value)}><option value="">—</option><option value="critique">{t('qhse.eq.critique')}</option><option value="normale">{t('qhse.eq.normale')}</option></select></label>
              <label className="field" style={{ flex: '1 1 120px' }}>{t('qhse.eq.frequence')}<input type="number" min="0" value={f.frequence_mois} onChange={e => set('frequence_mois', e.target.value)} /></label>
            </div>
            <div><button type="submit" className="btn btn-primary" disabled={!f.libelle}>{t('common.save')}</button></div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('qhse.eq.code')}</th><th>{t('qhse.eq.libelle')}</th><th>{t('qhse.eq.type')}</th><th>{t('qhse.eq.localisation')}</th>
            <th>{t('qhse.eq.criticite')}</th><th>{t('qhse.eq.prochaine')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {list.map(e => {
              const due = dueState(e.prochaine_verif);
              return (
                <tr key={e.id}>
                  <td>{e.code || '—'}</td>
                  <td>{e.libelle}</td>
                  <td>{e.type || '—'}</td>
                  <td>{e.localisation || '—'}</td>
                  <td>{e.criticite ? t('qhse.eq.' + e.criticite) : '—'}</td>
                  <td>{dstr(e.prochaine_verif) || '—'}{due && due !== 'ok' && <span className="badge" style={{ marginLeft: 6, background: due === 'late' ? 'var(--status-red-bg)' : 'var(--status-amber-bg,#fef3c7)', color: due === 'late' ? 'var(--status-red-fg)' : 'var(--status-amber-fg,#b45309)' }}>{t(due === 'late' ? 'qhse.eq.late' : 'qhse.eq.soon')}</span>}</td>
                  <td>{t('qhse.eqstatut.' + e.statut)}</td>
                  <td><Link to={`/qhse/equipements/${e.id}`}>{t('qhse.ana.open')}</Link></td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={8} className="empty-row">{t('qhse.eq.none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
