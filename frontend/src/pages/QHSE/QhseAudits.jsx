import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const TYPES = ['interne', 'externe', 'fournisseur'];
const EMPTY = { date_audit: '', type_audit: 'interne', perimetre: '', auditeur: '', referentiel: '', business_unit_id: '' };
const dstr = v => (v ? String(v).slice(0, 10) : '');

export default function QhseAudits() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canEdit = hasSubModuleLevel(user, 'qhse.audits', 'ajout');
  const [list, setList] = useState([]);
  const [bus, setBus] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = () => client.get('/qhse/audits').then(r => setList(r.data)).catch(() => {});
  useEffect(() => { load(); client.get('/business-units').then(r => setBus(r.data)).catch(() => {}); }, []);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function create(e) {
    e.preventDefault(); setErr('');
    try { await client.post('/qhse/audits', f); setF(EMPTY); setOpen(false); load(); }
    catch (e2) { setErr(e2.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.aud.title')}</h1>
      {canEdit && <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setOpen(o => !o)}>{t('qhse.aud.new')}</button>}

      {open && (
        <div className="card" style={{ maxWidth: 760, marginBottom: 14 }}>
          {err && <div className="alert alert-danger">{err}</div>}
          <form onSubmit={create} className="form-grid" style={{ maxWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.aud.date')}<input type="date" value={f.date_audit} onChange={e => set('date_audit', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.aud.type')}<select value={f.type_audit} onChange={e => set('type_audit', e.target.value)}>{TYPES.map(x => <option key={x} value={x}>{t('qhse.audtype.' + x)}</option>)}</select></label>
              <label className="field" style={{ flex: '1 1 140px' }}>BU<select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}><option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
            </div>
            <label className="field">{t('qhse.aud.perimetre')} *<input value={f.perimetre} onChange={e => set('perimetre', e.target.value)} /></label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.aud.auditeur')}<input value={f.auditeur} onChange={e => set('auditeur', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.aud.referentiel')}<input value={f.referentiel} onChange={e => set('referentiel', e.target.value)} placeholder={t('qhse.aud.referentielHint')} /></label>
            </div>
            <div><button type="submit" className="btn btn-primary" disabled={!f.perimetre}>{t('qhse.aud.create')}</button></div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>N°</th><th>{t('qhse.aud.date')}</th><th>{t('qhse.aud.type')}</th><th>{t('qhse.aud.perimetre')}</th>
            <th>{t('qhse.aud.constats')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id}>
                <td>{a.numero}</td>
                <td>{dstr(a.date_audit) || '—'}</td>
                <td>{a.type_audit ? t('qhse.audtype.' + a.type_audit) : '—'}</td>
                <td>{a.perimetre || '—'}</td>
                <td>{a.nb_nc > 0 ? `${a.nb_nc} NC / ${a.nb_constats}` : (a.nb_constats || 0)}</td>
                <td>{t('qhse.audstatut.' + a.statut)}</td>
                <td><Link to={`/qhse/audits/${a.id}`}>{t('qhse.ana.open')}</Link></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.aud.none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
