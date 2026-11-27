import { useEffect, useState } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal.jsx';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

const TYPES = ['politique', 'manuel', 'procedure', 'instruction', 'formulaire', 'enregistrement', 'plan', 'autre'];
const DOMAINES = ['qualite', 'hygiene', 'securite', 'environnement', 'transverse'];
const STATUTS = ['brouillon', 'en_vigueur', 'obsolete'];
const EMPTY = {
  reference: '', titre: '', type_document: 'procedure', domaine: 'qualite', business_unit_id: '',
  version: '1', statut: 'brouillon', date_application: '', date_revision: '', redacteur: '',
  verificateur: '', approbateur: '', emplacement: '', diffusion: '', observations: '', motif_revision: '',
};
const dstr = v => (v ? String(v).slice(0, 10) : '');

const STATUT_COLORS = {
  brouillon: { bg: 'var(--status-blue-bg)', fg: 'var(--status-blue-fg)' },
  en_vigueur: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  obsolete: { bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
};

export default function QhseDocuments() {
  const { t } = useI18n();
  const { user } = useAuth();
  const confirm = useConfirm();
  const canEdit = hasSubModuleLevel(user, 'qhse.documents', 'ajout');
  const canDelete = hasSubModuleLevel(user, 'qhse.documents', 'edition');
  const [list, setList] = useState([]);
  const [bus, setBus] = useState([]);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [fStatut, setFStatut] = useState('');

  const load = () => client.get('/qhse/documents').then(r => setList(r.data)).catch(() => {});
  useEffect(() => { load(); client.get('/business-units').then(r => setBus(r.data)).catch(() => {}); }, []);

  async function remove(id) {
    if (!(await confirm(t('qhse.doc.deleteConfirm'), { danger: true }))) return;
    await client.delete(`/qhse/documents/${id}`); load();
  }
  async function openEdit(id) {
    const r = await client.get(`/qhse/documents/${id}`);
    const d = r.data;
    setEditing({ ...EMPTY, ...d, date_application: dstr(d.date_application), date_revision: dstr(d.date_revision), motif_revision: '', revisions: d.revisions || [] });
  }

  const ql = q.trim().toLowerCase();
  const filtered = list.filter(d =>
    (!fStatut || d.statut === fStatut) &&
    (!ql || [d.titre, d.reference, d.redacteur].some(x => (x || '').toLowerCase().includes(ql))));
  const nbAReviser = list.filter(d => d.a_reviser).length;

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.doc.title')}</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t('qhse.doc.hint')}</p>
      {nbAReviser > 0 && <div className="alert" style={{ background: 'var(--status-amber-bg,#fef3c7)', color: 'var(--status-amber-fg,#b45309)', maxWidth: 760 }}>{t('qhse.doc.aReviserN').replace('{n}', nbAReviser)}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {canEdit && <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>{t('qhse.doc.new')}</button>}
        <input placeholder={t('qhse.doc.search')} value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 240 }} />
        <select value={fStatut} onChange={e => setFStatut(e.target.value)}>
          <option value="">{t('qhse.doc.allStatuts')}</option>
          {STATUTS.map(s => <option key={s} value={s}>{t('qhse.docstatut.' + s)}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('qhse.doc.reference')}</th><th>{t('qhse.doc.titre')}</th><th>{t('qhse.doc.type')}</th>
            <th>{t('qhse.doc.version')}</th><th>{t('qhse.doc.dateRevision')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id}>
                <td>{d.reference || '—'}</td>
                <td>{d.titre}{d.bu_nom ? <span className="muted"> · {d.bu_nom}</span> : ''}</td>
                <td>{t('qhse.doctype.' + d.type_document)}</td>
                <td>{d.version}</td>
                <td>{dstr(d.date_revision) || '—'}{d.a_reviser && <span className="badge" style={{ marginLeft: 6, background: 'var(--status-amber-bg,#fef3c7)', color: 'var(--status-amber-fg,#b45309)' }}>{t('qhse.doc.aReviser')}</span>}</td>
                <td><StatutBadge statut={d.statut} t={t} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(d.id)}>{t('common.edit')}</button>}{' '}
                  {canDelete && <button className="btn btn-danger btn-sm" onClick={() => remove(d.id)}>✕</button>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.doc.none')}</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <Editor initial={editing} bus={bus} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function StatutBadge({ statut, t }) {
  const c = STATUT_COLORS[statut] || {};
  return <span className="badge" style={{ background: c.bg, color: c.fg }}>{t('qhse.docstatut.' + statut)}</span>;
}

function Editor({ initial, bus, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const versionChanged = f.id && initial.version && f.version !== initial.version;

  async function save() {
    setBusy(true); setErr('');
    try {
      if (f.id) await client.put(`/qhse/documents/${f.id}`, f);
      else await client.post('/qhse/documents', f);
      onSaved();
    } catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); setBusy(false); }
  }

  return (
    <Modal title={f.id ? t('qhse.doc.edit') : t('qhse.doc.new')} onClose={onClose} wide>
      {err && <div className="alert alert-danger">{err}</div>}
      <div className="form-grid" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.doc.reference')}<input value={f.reference} onChange={e => set('reference', e.target.value)} /></label>
          <label className="field" style={{ flex: '3 1 260px' }}>{t('qhse.doc.titre')} *<input value={f.titre} onChange={e => set('titre', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.doc.type')}<select value={f.type_document} onChange={e => set('type_document', e.target.value)}>{TYPES.map(x => <option key={x} value={x}>{t('qhse.doctype.' + x)}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.doc.domaine')}<select value={f.domaine || ''} onChange={e => set('domaine', e.target.value)}><option value="">—</option>{DOMAINES.map(x => <option key={x} value={x}>{t('qhse.docdom.' + x)}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 140px' }}>BU<select value={f.business_unit_id || ''} onChange={e => set('business_unit_id', e.target.value)}><option value="">{t('qhse.doc.transverse')}</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 90px' }}>{t('qhse.doc.version')}<input value={f.version} onChange={e => set('version', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.ana.statut')}<select value={f.statut} onChange={e => set('statut', e.target.value)}>{STATUTS.map(s => <option key={s} value={s}>{t('qhse.docstatut.' + s)}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.doc.dateApplication')}<input type="date" value={f.date_application} onChange={e => set('date_application', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.doc.dateRevision')}<input type="date" value={f.date_revision} onChange={e => set('date_revision', e.target.value)} /></label>
        </div>
        {versionChanged && <label className="field">{t('qhse.doc.motifRevision')}<input value={f.motif_revision} onChange={e => set('motif_revision', e.target.value)} placeholder={t('qhse.doc.motifPlaceholder')} /></label>}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.doc.redacteur')}<input value={f.redacteur} onChange={e => set('redacteur', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.doc.verificateur')}<input value={f.verificateur} onChange={e => set('verificateur', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.doc.approbateur')}<input value={f.approbateur} onChange={e => set('approbateur', e.target.value)} /></label>
        </div>
        <label className="field">{t('qhse.doc.emplacement')}<input value={f.emplacement} onChange={e => set('emplacement', e.target.value)} placeholder={t('qhse.doc.emplacementPlaceholder')} /></label>
        <label className="field">{t('qhse.doc.diffusion')}<input value={f.diffusion} onChange={e => set('diffusion', e.target.value)} /></label>
        <label className="field">{t('qhse.doc.observations')}<textarea rows={2} value={f.observations} onChange={e => set('observations', e.target.value)} /></label>

        {f.id && (f.revisions || []).length > 0 && (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{t('qhse.doc.histoRevisions')}</div>
            <div className="table-wrap"><table><thead><tr>
              <th>{t('qhse.doc.version')}</th><th>{t('qhse.doc.dateRevision')}</th><th>{t('qhse.doc.motif')}</th><th>{t('qhse.doc.par')}</th>
            </tr></thead><tbody>
              {f.revisions.map(rv => (
                <tr key={rv.id}><td>{rv.version || '—'}</td><td>{dstr(rv.date_revision) || '—'}</td><td>{rv.motif || '—'}</td><td>{rv.par || '—'}</td></tr>
              ))}
            </tbody></table></div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" disabled={busy || !f.titre} onClick={save}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}
