import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';
import { useI18n } from '../../i18n/I18nContext';

const GRAVITES = ['Mineure', 'Majeure', 'Critique'];
const STATUTS = ['Déclarée', 'En réparation', 'Réparée', 'Clôturée'];
const graviteColor = g => (g === 'Critique' ? 'var(--status-red-fg)' : g === 'Majeure' ? 'var(--status-amber-fg)' : 'var(--status-green-fg)');
const graviteBg = g => (g === 'Critique' ? 'var(--status-red-bg)' : g === 'Majeure' ? 'var(--status-amber-bg)' : 'var(--status-green-bg)');

function AuthImage({ src, alt, style }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let obj; let alive = true;
    client.get(src, { responseType: 'blob' }).then(r => { if (alive) { obj = URL.createObjectURL(r.data); setUrl(obj); } }).catch(() => {});
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [src]);
  return url ? <img src={url} alt={alt} style={style} /> : null;
}

const emptyForm = () => ({ vehicle_id: '', gravite: 'Majeure', description: '', localisation: '', files: [] });

export default function PannesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canView = hasSubModuleLevel(user, 'logistique.maintenance');
  const canAdd = hasSubModuleLevel(user, 'logistique.maintenance', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'logistique.maintenance', 'edition');

  const [pannes, setPannes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [garages, setGarages] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [current, setCurrent] = useState(null); // panne ouverte (détail + photos)
  const [repFor, setRepFor] = useState(null);    // { panneId, garage_id, cout } — envoi en réparation
  const [photoVer, setPhotoVer] = useState(0);
  const [error, setError] = useState('');

  function load() { client.get('/pannes').then(r => setPannes(r.data)).catch(() => {}); }
  useEffect(() => {
    if (!canView) return;
    load();
    client.get('/vehicles').then(r => setVehicles(r.data)).catch(() => {});
    client.get('/garages').then(r => setGarages(r.data)).catch(() => {});
  }, [canView]);

  async function sendToReparation() {
    if (!repFor.garage_id) { setError(t('log.pannes.chooseGarage')); return; }
    setError('');
    try {
      await client.post('/reparations', { panne_id: repFor.panneId, garage_id: Number(repFor.garage_id), cout: repFor.cout });
      setRepFor(null);
      load();
    } catch (err) { setError(err.response?.data?.error || t('ref.error')); }
  }

  if (!canView) return <div><LogistiqueSubnav /><p>{t('log.notGranted')}</p></div>;

  async function declare(e) {
    e.preventDefault();
    if (!form.vehicle_id || !form.description.trim()) { setError(t('log.vehDescRequired')); return; }
    setError('');
    try {
      const { data } = await client.post('/pannes', {
        vehicle_id: Number(form.vehicle_id), gravite: form.gravite, description: form.description, localisation: form.localisation,
      });
      for (const f of form.files) {
        const fd = new FormData(); fd.append('file', f);
        await client.post(`/pannes/${data.id}/photos`, fd).catch(() => {});
      }
      setForm(emptyForm()); setShowForm(false); load();
    } catch (err) { setError(err.response?.data?.error || t('ref.error')); }
  }

  async function changeStatut(p, statut) {
    await client.put(`/pannes/${p.id}`, { statut });
    load();
    if (current && current.id === p.id) setCurrent(c => ({ ...c, statut }));
  }
  async function removePanne(p) {
    if (!window.confirm(t('log.pannes.confirmDelete', { ref: p.reference }))) return;
    await client.delete(`/pannes/${p.id}`);
    if (current && current.id === p.id) setCurrent(null);
    load();
  }
  async function openDetail(id) {
    const { data } = await client.get(`/pannes/${id}`);
    setCurrent(data);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  async function addPhoto(peId, file) {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    await client.post(`/pannes/${peId}/photos`, fd);
    await openDetail(peId); setPhotoVer(v => v + 1); load();
  }
  async function removePhoto(photoId) {
    await client.delete(`/pannes/photos/${photoId}`);
    if (current) await openDetail(current.id);
    setPhotoVer(v => v + 1); load();
  }

  const vLabel = v => `${v.immatriculation}${v.marque ? ' — ' + v.marque : ''}`;

  return (
    <div>
      <LogistiqueSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{t('log.nav.pannes')}</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{t('log.pannes.subtitle')}</p>
        </div>
        {canAdd && <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setError(''); }}>{showForm ? t('common.cancel') : t('log.pannes.declare')}</button>}
      </div>

      {showForm && canAdd && (
        <section className="card">
          <form onSubmit={declare} className="form-grid" style={{ maxWidth: 560 }}>
            <label className="field">{t('log.f.vehicle_id')}
              <select value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))} required>
                <option value="" disabled>{t('log.choose')}</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{vLabel(v)}</option>)}
              </select>
            </label>
            <label className="field">{t('log.pannes.gravity')}
              <select value={form.gravite} onChange={e => setForm(f => ({ ...f, gravite: e.target.value }))}>
                {GRAVITES.map(g => <option key={g} value={g}>{t('log.grav.' + g)}</option>)}
              </select>
            </label>
            <label className="field">{t('log.desc')}
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required placeholder={t('log.pannes.descPh')} />
            </label>
            <label className="field">{t('log.loc')}
              <input value={form.localisation} onChange={e => setForm(f => ({ ...f, localisation: e.target.value }))} placeholder={t('log.locPh')} />
            </label>
            <label className="field">{t('log.pannes.photosOpt')}
              <input type="file" accept="image/png,image/jpeg" multiple onChange={e => setForm(f => ({ ...f, files: [...e.target.files] }))} />
            </label>
            {error && <div className="alert alert-danger">{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>{t('log.pannes.declareBtn')}</button>
          </form>
        </section>
      )}

      {pannes.length === 0 && <p className="empty-row">{t('log.pannes.empty')}</p>}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('log.ref')}</th><th>{t('log.f.vehicle_id')}</th><th>{t('log.pannes.gravity')}</th><th>{t('log.desc')}</th><th>{t('log.f.statut')}</th><th>{t('log.photos')}</th>{canEdit && <th className="sticky-col" />}</tr></thead>
            <tbody>
              {pannes.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.reference}</strong></td>
                  <td>{p.vehicle_immat}</td>
                  <td><span className="badge" style={{ background: graviteBg(p.gravite), color: graviteColor(p.gravite) }}>{t('log.grav.' + p.gravite)}</span></td>
                  <td>{p.description}</td>
                  <td>
                    {canEdit
                      ? <select value={p.statut} onChange={e => changeStatut(p, e.target.value)}>{STATUTS.map(s => <option key={s} value={s}>{t('log.panneStatut.' + s)}</option>)}</select>
                      : t('log.panneStatut.' + p.statut)}
                  </td>
                  <td>{p.n_photos > 0 ? `📷 ${p.n_photos}` : '—'}</td>
                  {canEdit && (
                    <td className="sticky-col" style={{ whiteSpace: 'nowrap' }}>
                      {p.statut === 'Déclarée' && <button className="btn btn-primary btn-sm" style={{ marginRight: 6 }} onClick={() => { setRepFor({ panneId: p.id, garage_id: '', cout: '' }); setError(''); }}>{t('log.pannes.toRepair')}</button>}
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => openDetail(p.id)}>{t('log.photos')}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => removePanne(p)}>{t('common.delete')}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {repFor && (
        <section className="card" style={{ marginTop: 12 }}>
          <strong style={{ fontSize: 15 }}>{t('log.pannes.sendRepair')}</strong>
          <div className="form-inline" style={{ marginTop: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field">{t('log.garage')}
              <select value={repFor.garage_id} onChange={e => setRepFor(r => ({ ...r, garage_id: e.target.value }))} required>
                <option value="" disabled>{t('log.choose')}</option>
                {garages.map(g => <option key={g.id} value={g.id}>{g.nom}{g.ville ? ` — ${g.ville}` : ''}{g.sous_contrat ? t('log.gar.underContractShort') : ''}</option>)}
              </select>
            </label>
            <label className="field">{t('log.pannes.estCost')}
              <input type="number" value={repFor.cout} onChange={e => setRepFor(r => ({ ...r, cout: e.target.value }))} />
            </label>
            <button className="btn btn-primary btn-sm" onClick={sendToReparation}>{t('log.confirm')}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setRepFor(null)}>{t('common.cancel')}</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: '8px 0 0' }}>{t('log.pannes.autoMaintNote')}</p>
          {error && <div className="alert alert-danger" style={{ marginTop: 8 }}>{error}</div>}
        </section>
      )}

      {current && (
        <section className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{current.reference} — {current.vehicle_immat}</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setCurrent(null)}>{t('log.close')}</button>
          </div>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>{t('log.grav.' + current.gravite)} · {t('log.panneStatut.' + current.statut)}{current.localisation ? ` · ${current.localisation}` : ''}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {(current.photos || []).map(ph => (
              <div key={`${ph.id}-${photoVer}`} style={{ position: 'relative' }}>
                <AuthImage src={`/pannes/photos/${ph.id}`} alt="Photo panne" style={{ height: 110, borderRadius: 8, border: '1px solid var(--color-border)', display: 'block' }} />
                {canEdit && <button className="btn btn-danger-ghost btn-sm" style={{ position: 'absolute', top: 4, right: 4 }} onClick={() => removePhoto(ph.id)}>×</button>}
              </div>
            ))}
            {(current.photos || []).length === 0 && <span className="empty-row">{t('log.pannes.noPhoto')}</span>}
          </div>
          {canAdd && (
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginTop: 12, display: 'inline-block' }}>
              {t('log.addPhoto')}
              <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={e => { addPhoto(current.id, e.target.files[0]); e.target.value = ''; }} />
            </label>
          )}
        </section>
      )}
    </div>
  );
}
