import { useEffect, useState } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal.jsx';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

const NIVEAU_COLORS = {
  faible: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  modere: { bg: 'var(--status-blue-bg)', fg: 'var(--status-blue-fg)' },
  eleve: { bg: 'var(--status-amber-bg,#fef3c7)', fg: 'var(--status-amber-fg,#b45309)' },
  critique: { bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
};
const EMPTY = { unite_travail: '', business_unit_id: '', danger: '', risque: '', personnes_exposees: '', gravite: '', probabilite: '', exposition: '', mesures_existantes: '', mesures_prevues: '', responsable: '', echeance: '', statut: 'ouvert' };
const dstr = v => (v ? String(v).slice(0, 10) : '');

function NiveauBadge({ niveau, t }) {
  if (!niveau) return <span>—</span>;
  const c = NIVEAU_COLORS[niveau] || {};
  return <span className="badge" style={{ background: c.bg, color: c.fg }}>{t('qhse.sstniv.' + niveau)}</span>;
}

export default function QhseSstRisks() {
  const { t } = useI18n();
  const { user } = useAuth();
  const confirm = useConfirm();
  const canEdit = hasSubModuleLevel(user, 'qhse.sst_risks', 'ajout');
  const canDelete = hasSubModuleLevel(user, 'qhse.sst_risks', 'edition');
  const [list, setList] = useState([]);
  const [bus, setBus] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => client.get('/qhse/sst/risks').then(r => setList(r.data)).catch(() => {});
  useEffect(() => { load(); client.get('/business-units').then(r => setBus(r.data)).catch(() => {}); }, []);

  async function remove(id) {
    if (!(await confirm(t('qhse.sstr.deleteConfirm'), { danger: true }))) return;
    await client.delete(`/qhse/sst/risks/${id}`); load();
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.sstr.title')}</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t('qhse.sstr.cotationHint')}</p>
      {canEdit && <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setEditing({ ...EMPTY })}>{t('qhse.sstr.new')}</button>}

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('qhse.sstr.unite')}</th><th>{t('qhse.sstr.danger')}</th><th>G×P×E</th><th>Score</th><th>{t('qhse.sstr.niveau')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {list.map(r => (
              <tr key={r.id}>
                <td>{r.unite_travail || '—'}{r.bu_nom ? ` · ${r.bu_nom}` : ''}</td>
                <td>{r.danger || '—'}</td>
                <td>{r.gravite || '–'}×{r.probabilite || '–'}×{r.exposition || '–'}</td>
                <td>{r.score ?? '—'}</td>
                <td><NiveauBadge niveau={r.niveau} t={t} /></td>
                <td>{t('qhse.sststatut.' + r.statut)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ ...r, echeance: dstr(r.echeance) })}>{t('common.edit')}</button>}{' '}
                  {canDelete && <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>✕</button>}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.sstr.none')}</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <Editor initial={editing} bus={bus} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function Editor({ initial, bus, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const g = Number(f.gravite) || 0, p = Number(f.probabilite) || 0, ex = Number(f.exposition) || 0;
  const score = (g && p && ex) ? g * p * ex : null;
  const niveau = score == null ? null : score <= 8 ? 'faible' : score <= 16 ? 'modere' : score <= 32 ? 'eleve' : 'critique';
  const sel14 = (k) => (
    <select value={f[k]} onChange={e => set(k, e.target.value)}><option value="">—</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select>
  );

  async function save() {
    setBusy(true); setErr('');
    try {
      if (f.id) await client.put(`/qhse/sst/risks/${f.id}`, f);
      else await client.post('/qhse/sst/risks', f);
      onSaved();
    } catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); setBusy(false); }
  }

  return (
    <Modal title={f.id ? t('qhse.sstr.edit') : t('qhse.sstr.new')} onClose={onClose} wide>
      {err && <div className="alert alert-danger">{err}</div>}
      <div className="form-grid" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '2 1 220px' }}>{t('qhse.sstr.unite')}<input value={f.unite_travail} onChange={e => set('unite_travail', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 140px' }}>BU<select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}><option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 120px' }}>{t('qhse.sstr.exposees')}<input type="number" min="0" value={f.personnes_exposees} onChange={e => set('personnes_exposees', e.target.value)} /></label>
        </div>
        <label className="field">{t('qhse.sstr.danger')}<input value={f.danger} onChange={e => set('danger', e.target.value)} /></label>
        <label className="field">{t('qhse.sstr.risque')}<input value={f.risque} onChange={e => set('risque', e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 110 }}>{t('qhse.sstr.gravite')} (1-4){sel14('gravite')}</label>
          <label className="field" style={{ width: 110 }}>{t('qhse.sstr.proba')} (1-4){sel14('probabilite')}</label>
          <label className="field" style={{ width: 110 }}>{t('qhse.sstr.expo')} (1-4){sel14('exposition')}</label>
          <div style={{ fontSize: 14 }}>Score : <strong>{score ?? '—'}</strong> {niveau && <NiveauBadge niveau={niveau} t={t} />}</div>
        </div>
        <label className="field">{t('qhse.sstr.mesuresExist')}<textarea rows={2} value={f.mesures_existantes} onChange={e => set('mesures_existantes', e.target.value)} /></label>
        <label className="field">{t('qhse.sstr.mesuresPrev')}<textarea rows={2} value={f.mesures_prevues} onChange={e => set('mesures_prevues', e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.nc.responsable')}<input value={f.responsable} onChange={e => set('responsable', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.nc.echeance')}<input type="date" value={f.echeance} onChange={e => set('echeance', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.ana.statut')}<select value={f.statut} onChange={e => set('statut', e.target.value)}><option value="ouvert">{t('qhse.sststatut.ouvert')}</option><option value="maitrise">{t('qhse.sststatut.maitrise')}</option></select></label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}
