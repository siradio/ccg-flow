import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import Pagination from '../../components/Pagination.jsx';
import Modal from '../../components/Modal.jsx';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import DsiSubnav from './DsiSubnav';
import { useI18n } from '../../i18n/I18nContext';

const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

export default function ActivitesList() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canEdit = hasSubModuleLevel(user, 'dsi.activites', 'edition');
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ q: '', type_id: '', fait_marquant: false, from: firstOfMonth(), to: today() });
  const [types, setTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [form, setForm] = useState(null);
  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');
  const setF = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
  const reload = () => setFilters(f => ({ ...f }));

  useEffect(() => {
    client.get('/dsi/referentials/activity-types').then(r => setTypes(r.data.map(x => ({ id: x.id, nom: x.libelle })))).catch(() => {});
    client.get('/dsi/activities/users').then(r => setUsers(r.data)).catch(() => {});
    client.get('/dsi/equipment', { params: { pageSize: 100 } }).then(r => setEquipments((r.data.items || []).map(e => ({ id: e.id, nom: `${e.numero_inventaire} — ${e.designation}` })))).catch(() => {});
  }, []);

  useEffect(() => {
    const params = { page };
    Object.entries(filters).forEach(([k, v]) => { if (v === true) params[k] = 'true'; else if (v) params[k] = v; });
    const timer = setTimeout(() => client.get('/dsi/activities', { params }).then(r => setData(r.data)).catch(() => setData({ items: [], total: 0, page: 1, pageSize: 20 })), 200);
    return () => clearTimeout(timer);
  }, [page, filters]);

  const items = data?.items || [];
  async function save(payload, id) { if (id) await client.put(`/dsi/activities/${id}`, payload); else await client.post('/dsi/activities', payload); setForm(null); reload(); }

  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('dsi.act.title')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({})}>{t('dsi.act.new')}</button>}
      </div>

      <div className="form-inline" style={{ margin: '14px 0', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="search" value={filters.q} onChange={e => setF('q', e.target.value)} placeholder={t('dsi.act.search')} style={{ minWidth: 220 }} />
        <label className="field">{t('dsi.act.from')}<input type="date" value={filters.from} onChange={e => setF('from', e.target.value)} /></label>
        <label className="field">{t('dsi.act.to')}<input type="date" value={filters.to} onChange={e => setF('to', e.target.value)} /></label>
        <select value={filters.type_id} onChange={e => setF('type_id', e.target.value)}>
          <option value="">{t('dsi.act.allTypes')}</option>
          {types.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
        </select>
        <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={filters.fait_marquant} onChange={e => setF('fait_marquant', e.target.checked)} /> {t('dsi.act.highlightsOnly')}</label>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {!data ? <Loading /> : (
            <table>
              <thead><tr>
                <th>{t('dsi.act.date')}</th><th>{t('dsi.act.type')}</th><th>{t('dsi.act.description')}</th>
                <th>{t('dsi.act.technician')}</th><th>{t('dsi.act.duree')}</th><th>{t('dsi.act.equipement')}</th>
                <th>{t('dsi.act.highlight')}</th>{canEdit && <th />}
              </tr></thead>
              <tbody>
                {items.map(a => (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dfmt(a.date)}</td>
                    <td>{a.type_libelle || '—'}</td>
                    <td>{a.description}</td>
                    <td>{a.technician_nom || '—'}</td>
                    <td>{a.duree_min ? `${a.duree_min} min` : '—'}</td>
                    <td>{a.equipement_numero || '—'}</td>
                    <td>{a.fait_marquant ? '★' : ''}</td>
                    {canEdit && <td><button className="btn btn-secondary btn-sm" onClick={() => setForm({ initial: a })}>{t('common.edit')}</button></td>}
                  </tr>
                ))}
                {items.length === 0 && <tr><td className="empty-row" colSpan={canEdit ? 8 : 7}>{t('dsi.act.empty')}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}

      {form && <ActivityForm initial={form.initial} types={types} users={users} equipments={equipments} onClose={() => setForm(null)} onSubmit={(p) => save(p, form.initial?.id)} />}
    </div>
  );
}

function ActivityForm({ initial, types, users, equipments, onClose, onSubmit }) {
  const { t } = useI18n();
  const [f, setF] = useState({
    date: initial?.date ? String(initial.date).slice(0, 10) : today(),
    type_id: initial?.type_id || '', technician_id: initial?.technician_id || '', duree_min: initial?.duree_min || '',
    description: initial?.description || '', equipment_id: initial?.equipment_id || '', user_concerne_id: initial?.user_concerne_id || '',
    resultat: initial?.resultat || '', fait_marquant: !!initial?.fait_marquant, commentaire: initial?.commentaire || '',
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  async function submit(e) { e.preventDefault(); if (busy) return; if (!f.description.trim()) { setErr('Description requise.'); return; } setBusy(true); setErr(''); try { await onSubmit(f); } catch (e2) { setErr(e2.response?.data?.error || 'Erreur.'); setBusy(false); } }
  const Field = ({ label, children }) => (<label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)' }}>{label}{children}</label>);
  return (
    <Modal title={initial?.id ? t('dsi.act.edit') : t('dsi.act.new')} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <Field label={t('dsi.act.date')}><input type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
          <Field label={t('dsi.act.type')}><SearchableSelect value={f.type_id} onChange={v => set('type_id', v ?? '')} options={types} getLabel={o => o.nom} placeholder="Type…" /></Field>
          <Field label={t('dsi.act.technician')}><SearchableSelect value={f.technician_id} onChange={v => set('technician_id', v ?? '')} options={users} getLabel={o => o.nom} placeholder="Technicien…" /></Field>
          <Field label={t('dsi.act.duree')}><input type="number" value={f.duree_min} onChange={e => set('duree_min', e.target.value)} /></Field>
          <Field label={t('dsi.act.equipement')}><SearchableSelect value={f.equipment_id} onChange={v => set('equipment_id', v ?? '')} options={equipments} getLabel={o => o.nom} placeholder="—" /></Field>
          <Field label={t('dsi.act.userConcerne')}><SearchableSelect value={f.user_concerne_id} onChange={v => set('user_concerne_id', v ?? '')} options={users} getLabel={o => o.nom} placeholder="—" /></Field>
        </div>
        <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>{t('dsi.act.description') + ' *'}
          <textarea rows={2} value={f.description} onChange={e => set('description', e.target.value)} required />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 12, alignItems: 'end' }}>
          <Field label={t('dsi.act.resultat')}><input value={f.resultat} onChange={e => set('resultat', e.target.value)} /></Field>
          <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={f.fait_marquant} onChange={e => set('fait_marquant', e.target.checked)} /> {t('dsi.act.highlight')}</label>
        </div>
        {err && <div className="alert alert-danger" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '…' : (initial?.id ? t('common.save') : t('common.add'))}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}
