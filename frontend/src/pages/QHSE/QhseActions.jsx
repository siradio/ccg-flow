import { useEffect, useState } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal.jsx';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

const ORIGINES = ['audit', 'reclamation', 'accident', 'inspection', 'non_conformite', 'revue_direction', 'reglementaire', 'autre'];
const DOMAINES = ['qualite', 'hygiene', 'securite', 'environnement', 'transverse'];
const TYPES = ['corrective', 'preventive', 'amelioration'];
const STATUTS = ['a_faire', 'en_cours', 'faite', 'annulee'];
const EFFICACITES = ['non_evaluee', 'efficace', 'inefficace'];
const EMPTY = {
  origine: 'autre', reference_origine: '', domaine: 'transverse', business_unit_id: '', type_action: 'corrective',
  description: '', responsable: '', echeance: '', statut: 'a_faire', date_realisation: '', efficacite: 'non_evaluee', observations: '',
};
const dstr = v => (v ? String(v).slice(0, 10) : '');
const STATUT_COLORS = {
  a_faire: { bg: 'var(--status-blue-bg)', fg: 'var(--status-blue-fg)' },
  en_cours: { bg: 'var(--status-amber-bg,#fef3c7)', fg: 'var(--status-amber-fg,#b45309)' },
  faite: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  annulee: { bg: 'var(--status-grey-bg,#e5e7eb)', fg: 'var(--status-grey-fg,#6b7280)' },
};

export default function QhseActions() {
  const { t } = useI18n();
  const { user } = useAuth();
  const confirm = useConfirm();
  const canEdit = hasSubModuleLevel(user, 'qhse.actions', 'ajout');
  const canDelete = hasSubModuleLevel(user, 'qhse.actions', 'edition');
  const [list, setList] = useState([]);
  const [sum, setSum] = useState(null);
  const [bus, setBus] = useState([]);
  const [editing, setEditing] = useState(null);
  const [fStatut, setFStatut] = useState('');
  const [fOrigine, setFOrigine] = useState('');

  const load = () => {
    client.get('/qhse/actions').then(r => setList(r.data)).catch(() => {});
    client.get('/qhse/actions/summary').then(r => setSum(r.data)).catch(() => {});
  };
  useEffect(() => { load(); client.get('/business-units').then(r => setBus(r.data)).catch(() => {}); }, []);

  async function remove(id) {
    if (!(await confirm(t('qhse.act.deleteConfirm'), { danger: true }))) return;
    await client.delete(`/qhse/actions/${id}`); load();
  }

  const filtered = list.filter(a => (!fStatut || a.statut === fStatut) && (!fOrigine || a.origine === fOrigine));

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.act.title')}</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t('qhse.act.hint')}</p>

      {sum && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <StatCard label={t('qhse.actstatut2.a_faire')} value={sum.parStatut?.a_faire || 0} />
          <StatCard label={t('qhse.actstatut2.en_cours')} value={sum.parStatut?.en_cours || 0} />
          <StatCard label={t('qhse.actstatut2.faite')} value={sum.parStatut?.faite || 0} />
          <StatCard label={t('qhse.act.enRetard')} value={sum.enRetard || 0} danger={sum.enRetard > 0} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {canEdit && <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>{t('qhse.act.new')}</button>}
        <select value={fStatut} onChange={e => setFStatut(e.target.value)}>
          <option value="">{t('qhse.act.allStatuts')}</option>
          {STATUTS.map(s => <option key={s} value={s}>{t('qhse.actstatut2.' + s)}</option>)}
        </select>
        <select value={fOrigine} onChange={e => setFOrigine(e.target.value)}>
          <option value="">{t('qhse.act.allOrigines')}</option>
          {ORIGINES.map(o => <option key={o} value={o}>{t('qhse.actorig.' + o)}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>N°</th><th>{t('qhse.act.origine')}</th><th>{t('qhse.act.description')}</th><th>{t('qhse.act.type')}</th>
            <th>{t('qhse.nc.responsable')}</th><th>{t('qhse.nc.echeance')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td>{a.numero}</td>
                <td>{t('qhse.actorig.' + a.origine)}{a.reference_origine ? <span className="muted"> · {a.reference_origine}</span> : ''}</td>
                <td>{a.description}</td>
                <td>{t('qhse.acttype.' + a.type_action)}</td>
                <td>{a.responsable || '—'}</td>
                <td>{dstr(a.echeance) || '—'}{a.en_retard && <span className="badge" style={{ marginLeft: 6, background: 'var(--status-red-bg)', color: 'var(--status-red-fg)' }}>{t('qhse.act.retard')}</span>}</td>
                <td><StatutBadge statut={a.statut} t={t} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ ...a, echeance: dstr(a.echeance), date_realisation: dstr(a.date_realisation) })}>{t('common.edit')}</button>}{' '}
                  {canDelete && <button className="btn btn-danger btn-sm" onClick={() => remove(a.id)}>✕</button>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="empty-row">{t('qhse.act.none')}</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <Editor initial={editing} bus={bus} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function StatCard({ label, value, danger }) {
  return (
    <div className="card" style={{ minWidth: 120, padding: '10px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: danger ? 'var(--status-red-fg)' : 'inherit' }}>{value}</div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}

function StatutBadge({ statut, t }) {
  const c = STATUT_COLORS[statut] || {};
  return <span className="badge" style={{ background: c.bg, color: c.fg }}>{t('qhse.actstatut2.' + statut)}</span>;
}

function Editor({ initial, bus, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const done = f.statut === 'faite';

  async function save() {
    setBusy(true); setErr('');
    try {
      if (f.id) await client.put(`/qhse/actions/${f.id}`, f);
      else await client.post('/qhse/actions', f);
      onSaved();
    } catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); setBusy(false); }
  }

  return (
    <Modal title={f.id ? t('qhse.act.edit') : t('qhse.act.new')} onClose={onClose} wide>
      {err && <div className="alert alert-danger">{err}</div>}
      <div className="form-grid" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.act.origine')}<select value={f.origine} onChange={e => set('origine', e.target.value)}>{ORIGINES.map(o => <option key={o} value={o}>{t('qhse.actorig.' + o)}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.act.reference')}<input value={f.reference_origine} onChange={e => set('reference_origine', e.target.value)} placeholder="AUD-00012, REC-00007…" /></label>
          <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.doc.domaine')}<select value={f.domaine || ''} onChange={e => set('domaine', e.target.value)}><option value="">—</option>{DOMAINES.map(d => <option key={d} value={d}>{t('qhse.docdom.' + d)}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 140px' }}>BU<select value={f.business_unit_id || ''} onChange={e => set('business_unit_id', e.target.value)}><option value="">{t('qhse.doc.transverse')}</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
        </div>
        <label className="field">{t('qhse.act.description')} *<textarea rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.act.type')}<select value={f.type_action} onChange={e => set('type_action', e.target.value)}>{TYPES.map(x => <option key={x} value={x}>{t('qhse.acttype.' + x)}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.nc.responsable')}<input value={f.responsable} onChange={e => set('responsable', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.nc.echeance')}<input type="date" value={f.echeance} onChange={e => set('echeance', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.ana.statut')}<select value={f.statut} onChange={e => set('statut', e.target.value)}>{STATUTS.map(s => <option key={s} value={s}>{t('qhse.actstatut2.' + s)}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.act.dateReal')}<input type="date" value={f.date_realisation} onChange={e => set('date_realisation', e.target.value)} /></label>
          {done && <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.act.efficacite')}<select value={f.efficacite} onChange={e => set('efficacite', e.target.value)}>{EFFICACITES.map(x => <option key={x} value={x}>{t('qhse.acteff.' + x)}</option>)}</select></label>}
        </div>
        <label className="field">{t('qhse.doc.observations')}<textarea rows={2} value={f.observations} onChange={e => set('observations', e.target.value)} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" disabled={busy || !f.description} onClick={save}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}
