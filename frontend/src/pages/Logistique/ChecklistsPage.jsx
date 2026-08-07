import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

const TYPES = ['Départ', 'Retour', 'Hebdomadaire', 'Autre'];
const STATUT_OPTS = [['na', '—'], ['ok', 'OK'], ['ko', 'KO']];
const emptyModel = () => ({ id: null, nom: '', type: 'Départ', items: [''] });
const fullName = d => `${d.prenom || ''} ${d.nom || ''}`.trim();

// Image protégée : récupérée en blob (avec le token) puis affichée via une object-URL révoquée au
// démontage — même approche que l'aperçu du branding / des photos véhicule.
function AuthImage({ src, alt, style }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let obj; let alive = true;
    client.get(src, { responseType: 'blob' }).then(r => { if (alive) { obj = URL.createObjectURL(r.data); setUrl(obj); } }).catch(() => {});
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [src]);
  return url ? <img src={url} alt={alt} style={style} /> : null;
}

export default function ChecklistsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canView = hasSubModuleLevel(user, 'logistique.checklists');
  const canAdd = hasSubModuleLevel(user, 'logistique.checklists', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'logistique.checklists', 'edition');
  const [tab, setTab] = useState('runs');

  if (!canView) return <div><LogistiqueSubnav /><p>{t('log.notGranted')}</p></div>;

  return (
    <div>
      <LogistiqueSubnav />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'runs' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('runs')}>{t('log.chk.tabRuns')}</button>
        <button className={`btn btn-sm ${tab === 'models' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('models')}>{t('log.chk.tabModels')}</button>
      </div>
      {tab === 'runs'
        ? <RunsView canAdd={canAdd} canEdit={canEdit} />
        : <ModelsView canAdd={canAdd} canEdit={canEdit} />}
    </div>
  );
}

// ─── Réalisations ──────────────────────────────────────────────────────────────────────────
function RunsView({ canAdd, canEdit }) {
  const confirm = useConfirm();
  const { t, lang } = useI18n();
  const [runs, setRuns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [newRun, setNewRun] = useState(null); // { template_id, vehicle_id, driver_id } quand on démarre
  const [current, setCurrent] = useState(null); // réalisation en cours de remplissage (détail)
  const [error, setError] = useState('');
  const [photoVer, setPhotoVer] = useState(0);

  function loadRuns() { client.get('/checklists/runs').then(r => setRuns(r.data)).catch(() => {}); }
  useEffect(() => {
    loadRuns();
    client.get('/checklists/templates').then(r => setTemplates(r.data)).catch(() => {});
    client.get('/vehicles').then(r => setVehicles(r.data)).catch(() => {});
    client.get('/drivers').then(r => setDrivers(r.data)).catch(() => {});
  }, []);

  async function startRun(e) {
    e.preventDefault();
    if (!newRun.template_id || !newRun.vehicle_id) { setError(t('log.chk.modelVehRequired')); return; }
    setError('');
    try {
      const { data } = await client.post('/checklists/runs', {
        template_id: Number(newRun.template_id), vehicle_id: Number(newRun.vehicle_id),
        driver_id: newRun.driver_id ? Number(newRun.driver_id) : null,
      });
      setNewRun(null);
      openRun(data);
      loadRuns();
    } catch (err) { setError(err.response?.data?.error || t('ref.error')); }
  }

  function openRun(detail) {
    setCurrent({ ...detail, items: detail.items.map(i => ({ ...i })) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function reopen(id) {
    const { data } = await client.get(`/checklists/runs/${id}`);
    openRun(data);
  }

  function setItemField(itemId, field, value) {
    setCurrent(c => ({ ...c, items: c.items.map(it => (it.id === itemId ? { ...it, [field]: value } : it)) }));
  }

  async function uploadPhoto(itemId, file) {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      await client.put(`/checklists/run-items/${itemId}/photo`, fd);
      setItemField(itemId, 'has_photo', true);
      setPhotoVer(v => v + 1);
    } catch (err) { setError(err.response?.data?.error || t('log.chk.photoUploadFailed')); }
  }
  async function removePhoto(itemId) {
    await client.delete(`/checklists/run-items/${itemId}/photo`);
    setItemField(itemId, 'has_photo', false);
    setPhotoVer(v => v + 1);
  }

  async function saveRun() {
    try {
      await client.put(`/checklists/runs/${current.id}`, {
        notes: current.notes,
        items: current.items.map(i => ({ id: i.id, statut: i.statut, commentaire: i.commentaire })),
      });
      loadRuns();
      setCurrent(null);
    } catch (err) { setError(err.response?.data?.error || t('ref.error')); }
  }

  async function removeRun(r) {
    if (!(await confirm(t('log.chk.confirmDeleteRun', { name: `${r.template_nom} — ${r.vehicle_immat}` }), { danger: true, confirmLabel: t('common.delete') }))) return;
    await client.delete(`/checklists/runs/${r.id}`);
    loadRuns();
  }

  // Vue remplissage d'une réalisation
  if (current) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{current.template_nom} — {current.vehicle_immat}</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setCurrent(null)}>{t('log.close')}</button>
        </div>
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          {t('log.chkType.' + current.type)} · {current.driver_prenom ? `${current.driver_prenom} ${current.driver_nom}` : t('log.chk.noDriver')}
        </p>
        {error && <div className="alert alert-danger">{error}</div>}
        {current.items.map(it => (
          <div key={it.id} className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <strong>{it.libelle}</strong>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                <select value={it.statut} onChange={e => setItemField(it.id, 'statut', e.target.value)}
                  style={{ fontWeight: 700, color: it.statut === 'ok' ? 'var(--status-green-fg)' : it.statut === 'ko' ? 'var(--status-red-fg)' : 'var(--color-text-muted)' }}>
                  {STATUT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input placeholder={t('log.chk.commentPh')} value={it.commentaire || ''} onChange={e => setItemField(it.id, 'commentaire', e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              </div>
            </div>
            <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              {it.has_photo && <AuthImage key={`${it.id}-${photoVer}`} src={`/checklists/run-items/${it.id}/photo`} alt="Photo" style={{ height: 46, borderRadius: 6, border: '1px solid var(--color-border)' }} />}
              {canAdd && (
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  {it.has_photo ? t('log.chk.replace') : t('log.chk.addPhotoShort')}
                  <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={e => { uploadPhoto(it.id, e.target.files[0]); e.target.value = ''; }} />
                </label>
              )}
              {canAdd && it.has_photo && <button className="btn btn-danger-ghost btn-sm" onClick={() => removePhoto(it.id)}>{t('ref.removePhoto')}</button>}
            </div>
          </div>
        ))}
        <div className="card">
          <label className="field">{t('log.chk.generalNotes')}
            <textarea value={current.notes || ''} onChange={e => setCurrent(c => ({ ...c, notes: e.target.value }))} placeholder={t('log.chk.obsPh')} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={saveRun}>{t('common.save')}</button>
          <button className="btn btn-secondary" onClick={() => setCurrent(null)}>{t('common.cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{t('log.chk.doneTitle')}</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{t('log.chk.doneSub')}</p>
        </div>
        {canAdd && templates.length > 0 && (
          <button className="btn btn-primary" onClick={() => { setNewRun(newRun ? null : { template_id: '', vehicle_id: '', driver_id: '' }); setError(''); }}>
            {newRun ? t('common.cancel') : t('log.chk.newChecklist')}
          </button>
        )}
      </div>
      {canAdd && templates.length === 0 && <p className="empty-row">{t('log.chk.createModelFirst')}</p>}

      {newRun && (
        <section className="card">
          <form onSubmit={startRun} className="form-inline" style={{ flexWrap: 'wrap' }}>
            <label className="field">{t('log.chk.model')}
              <select value={newRun.template_id} onChange={e => setNewRun(n => ({ ...n, template_id: e.target.value }))} required>
                <option value="" disabled>{t('log.choose')}</option>
                {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.nom} ({t('log.chkType.' + tpl.type)})</option>)}
              </select>
            </label>
            <label className="field">{t('log.f.vehicle_id')}
              <select value={newRun.vehicle_id} onChange={e => setNewRun(n => ({ ...n, vehicle_id: e.target.value }))} required>
                <option value="" disabled>{t('log.choose')}</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.immatriculation}{v.marque ? ` — ${v.marque}` : ''}</option>)}
              </select>
            </label>
            <label className="field">{t('log.chk.driverOpt')}
              <select value={newRun.driver_id} onChange={e => setNewRun(n => ({ ...n, driver_id: e.target.value }))}>
                <option value="">—</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{fullName(d)}</option>)}
              </select>
            </label>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>{t('log.chk.start')}</button>
          </form>
          {error && <div className="alert alert-danger" style={{ marginTop: 8 }}>{error}</div>}
        </section>
      )}

      {runs.length === 0 && <p className="empty-row">{t('log.chk.noneRun')}</p>}
      {runs.map(r => (
        <div key={r.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong>{r.vehicle_immat}</strong> — {r.template_nom} <span className="badge" style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>{t('log.chkType.' + r.type)}</span>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {new Date(r.realise_le).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}
              {r.driver_nom ? ` · ${r.driver_prenom} ${r.driver_nom}` : ''}
              {' · '}<span style={{ color: 'var(--status-green-fg)' }}>{r.n_ok} OK</span>
              {r.n_ko > 0 && <span style={{ color: 'var(--status-red-fg)' }}> · {r.n_ko} KO</span>}
              {` / ${r.n_total}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => reopen(r.id)}>{t('log.open')}</button>
            {canEdit && <button className="btn btn-danger-ghost btn-sm" onClick={() => removeRun(r)}>{t('common.delete')}</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Modèles ───────────────────────────────────────────────────────────────────────────────
function ModelsView({ canAdd, canEdit }) {
  const confirm = useConfirm();
  const { t } = useI18n();
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(emptyModel());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function load() { client.get('/checklists/templates').then(r => setTemplates(r.data)).catch(() => {}); }
  useEffect(load, []);

  function startCreate() { setForm(emptyModel()); setShowForm(true); setError(''); }
  function startEdit(tpl) {
    setForm({ id: tpl.id, nom: tpl.nom, type: tpl.type, items: tpl.items.length ? tpl.items.map(i => i.libelle) : [''] });
    setShowForm(true); setError('');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  function cancel() { setShowForm(false); setForm(emptyModel()); setError(''); }
  function setItem(i, v) { setForm(f => ({ ...f, items: f.items.map((x, j) => (j === i ? v : x)) })); }
  function addItem() { setForm(f => ({ ...f, items: [...f.items, ''] })); }
  function removeItem(i) { setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) })); }

  async function save(e) {
    e.preventDefault();
    if (!form.nom.trim()) { setError(t('log.chk.modelNameRequired')); return; }
    const items = form.items.map(s => s.trim()).filter(Boolean);
    if (items.length === 0) { setError(t('log.chk.atLeastOneItem')); return; }
    setError('');
    try {
      if (form.id) await client.put(`/checklists/templates/${form.id}`, { nom: form.nom, type: form.type, items });
      else await client.post('/checklists/templates', { nom: form.nom, type: form.type, items });
      cancel(); load();
    } catch (err) { setError(err.response?.data?.error || t('ref.error')); }
  }
  async function remove(tpl) {
    if (!(await confirm(t('log.chk.confirmDeleteModel', { nom: tpl.nom }), { danger: true, confirmLabel: t('common.delete') }))) return;
    await client.delete(`/checklists/templates/${tpl.id}`);
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{t('log.chk.modelsTitle')}</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{t('log.chk.modelsSub')}</p>
        </div>
        {canAdd && (
          <button className="btn btn-primary" onClick={showForm && !form.id ? cancel : startCreate}>
            {showForm && !form.id ? t('common.cancel') : t('log.chk.newModel')}
          </button>
        )}
      </div>

      {templates.length === 0 && <p className="empty-row">{t('log.chk.noModels')}{canAdd ? t('log.chk.createOne') : ''}</p>}
      {templates.map(tpl => (
        <div key={tpl.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong>{tpl.nom}</strong>{' '}
            <span className="badge" style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>{t('log.chkType.' + tpl.type)}</span>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14, color: 'var(--color-text-muted)' }}>
              {tpl.items.map(i => <li key={i.id}>{i.libelle}</li>)}
              {tpl.items.length === 0 && <li style={{ listStyle: 'none', color: 'var(--color-text-faint)' }}>{t('log.chk.noItems')}</li>}
            </ul>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => startEdit(tpl)}>{t('common.edit')}</button>
              <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(tpl)}>{t('common.delete')}</button>
            </div>
          )}
        </div>
      ))}

      {showForm && (canAdd || (form.id && canEdit)) && (
        <section className="card" style={{ marginTop: 8 }}>
          <form onSubmit={save} className="form-grid" style={{ maxWidth: 560 }}>
            <strong style={{ fontSize: 15 }}>{form.id ? t('log.chk.editModel') : t('log.chk.newModelTitle')}</strong>
            <label className="field">{t('log.name')}
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required placeholder={t('log.chk.namePh')} />
            </label>
            <label className="field">{t('log.chk.type')}
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {TYPES.map(ty => <option key={ty} value={ty}>{t('log.chkType.' + ty)}</option>)}
              </select>
            </label>
            <div className="field">{t('log.chk.itemsToCheck')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {form.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input value={it} onChange={e => setItem(i, e.target.value)} placeholder={t('log.chk.itemPh', { n: i + 1 })} style={{ flex: 1 }} />
                    <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => removeItem(i)} disabled={form.items.length <= 1} title={t('ref.removePhoto')}>×</button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ alignSelf: 'flex-start' }}>{t('log.chk.addItem')}</button>
              </div>
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary">{form.id ? t('common.save') : t('log.chk.createModel')}</button>
              <button type="button" className="btn btn-secondary" onClick={cancel}>{t('common.cancel')}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
