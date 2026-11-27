import { useEffect, useState } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal.jsx';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

const TYPES = ['qualification', 'periodique'];
const STATUTS = ['en_cours', 'qualifie', 'sous_reserve', 'rejete'];
// Grille de critères par défaut (éditable) — proposée, non imposée.
const DEFAULT_CRITERIA = [
  { label: 'Qualité des produits livrés', note: '', note_max: 5 },
  { label: 'Respect des délais', note: '', note_max: 5 },
  { label: 'Conformité documentaire', note: '', note_max: 5 },
  { label: 'Réactivité / communication', note: '', note_max: 5 },
];
const dstr = v => (v ? String(v).slice(0, 10) : '');

export default function QhseSupplierEval() {
  const { t } = useI18n();
  const { user } = useAuth();
  const confirm = useConfirm();
  const canEdit = hasSubModuleLevel(user, 'qhse.supplier_eval', 'ajout');
  const canDelete = hasSubModuleLevel(user, 'qhse.supplier_eval', 'edition');
  const [list, setList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => client.get('/qhse/supplier-evaluations').then(r => setList(r.data)).catch(() => {});
  useEffect(() => {
    load();
    client.get('/suppliers').then(r => setSuppliers(r.data)).catch(() => {});
  }, []);

  async function remove(id) {
    if (!(await confirm(t('qhse.sev.deleteConfirm'), { danger: true }))) return;
    await client.delete(`/qhse/supplier-evaluations/${id}`); load();
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.sev.title')}</h1>
      {canEdit && <button className="btn btn-primary" style={{ marginBottom: 12 }}
        onClick={() => setEditing({ supplier_id: '', date_evaluation: '', type: 'periodique', statut: 'en_cours', criteria: DEFAULT_CRITERIA.map(x => ({ ...x })), commentaire: '' })}>{t('qhse.sev.new')}</button>}

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('qhse.sev.supplier')}</th><th>{t('qhse.sev.date')}</th><th>{t('qhse.sev.type')}</th>
            <th>{t('qhse.sev.note')}</th><th>{t('qhse.sev.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {list.map(e => (
              <tr key={e.id}>
                <td>{e.supplier_nom}</td>
                <td>{dstr(e.date_evaluation) || '—'}</td>
                <td>{t('qhse.sevtype.' + e.type)}</td>
                <td>{e.note != null ? `${Number(e.note)}${e.note_max != null ? ` / ${Number(e.note_max)}` : ''}` : '—'}</td>
                <td>{t('qhse.sevstatut.' + e.statut)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ ...e, date_evaluation: dstr(e.date_evaluation), criteria: Array.isArray(e.criteria) ? e.criteria.map(c => ({ ...c })) : [] })}>{t('common.edit')}</button>}{' '}
                  {canDelete && <button className="btn btn-danger btn-sm" onClick={() => remove(e.id)}>✕</button>}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="empty-row">{t('qhse.sev.none')}</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <Editor initial={editing} suppliers={suppliers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function Editor({ initial, suppliers, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const grid = f.criteria || [];
  const setCrit = (i, k, v) => setF(p => ({ ...p, criteria: p.criteria.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const total = grid.reduce((s, c) => s + (Number(c.note) || 0), 0);
  const totalMax = grid.reduce((s, c) => s + (Number(c.note_max) || 0), 0);

  async function save() {
    if (!f.supplier_id) { setErr(t('qhse.sev.supplierReq')); return; }
    setBusy(true); setErr('');
    const payload = { ...f, note: grid.length ? total : f.note, note_max: grid.length ? totalMax : f.note_max };
    try {
      if (f.id) await client.put(`/qhse/supplier-evaluations/${f.id}`, payload);
      else await client.post('/qhse/supplier-evaluations', payload);
      onSaved();
    } catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); setBusy(false); }
  }

  return (
    <Modal title={f.id ? t('qhse.sev.edit') : t('qhse.sev.new')} onClose={onClose} wide>
      {err && <div className="alert alert-danger">{err}</div>}
      <div className="form-grid" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '2 1 240px' }}>{t('qhse.sev.supplier')} *
            <SearchableSelect value={f.supplier_id} onChange={v => set('supplier_id', v ?? '')} options={suppliers}
              getLabel={s => s.nom} getSearch={s => `${s.nom} ${s.code || ''}`} placeholder={t('qhse.sev.supplier')} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.sev.date')}
            <input type="date" value={f.date_evaluation} onChange={e => set('date_evaluation', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.sev.type')}
            <select value={f.type} onChange={e => set('type', e.target.value)}>{TYPES.map(x => <option key={x} value={x}>{t('qhse.sevtype.' + x)}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.sev.statut')}
            <select value={f.statut} onChange={e => set('statut', e.target.value)}>{STATUTS.map(x => <option key={x} value={x}>{t('qhse.sevstatut.' + x)}</option>)}</select></label>
        </div>

        <div style={{ fontWeight: 600, margin: '6px 0' }}>{t('qhse.sev.criteria')} {grid.length > 0 && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>— {total} / {totalMax}</span>}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {grid.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={{ flex: 1 }} value={c.label || ''} onChange={e => setCrit(i, 'label', e.target.value)} placeholder={t('qhse.sev.critLabel')} />
              <input type="number" step="0.5" style={{ width: 70 }} value={c.note ?? ''} onChange={e => setCrit(i, 'note', e.target.value)} />
              <span style={{ color: 'var(--color-text-muted)' }}>/</span>
              <input type="number" step="0.5" style={{ width: 70 }} value={c.note_max ?? ''} onChange={e => setCrit(i, 'note_max', e.target.value)} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setF(p => ({ ...p, criteria: p.criteria.filter((_, j) => j !== i) }))}>✕</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6, alignSelf: 'flex-start' }}
          onClick={() => setF(p => ({ ...p, criteria: [...(p.criteria || []), { label: '', note: '', note_max: 5 }] }))}>+ {t('qhse.sev.addCrit')}</button>

        <label className="field">{t('qhse.sev.commentaire')}<textarea rows={2} value={f.commentaire || ''} onChange={e => set('commentaire', e.target.value)} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}
