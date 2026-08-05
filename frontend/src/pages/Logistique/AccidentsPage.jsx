import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';

const STATUTS = ['Déclaré', 'En cours', 'Clôturé'];

function AuthImage({ src, alt, style }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let obj; let alive = true;
    client.get(src, { responseType: 'blob' }).then(r => { if (alive) { obj = URL.createObjectURL(r.data); setUrl(obj); } }).catch(() => {});
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [src]);
  return url ? <img src={url} alt={alt} style={style} /> : null;
}

const emptyForm = () => ({ vehicle_id: '', description: '', localisation: '', tiers_implique: false, files: [] });

export default function AccidentsPage() {
  const { user } = useAuth();
  const canView = hasSubModuleLevel(user, 'logistique.accidents');
  const canAdd = hasSubModuleLevel(user, 'logistique.accidents', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'logistique.accidents', 'edition');

  const [accidents, setAccidents] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [current, setCurrent] = useState(null);
  const [photoVer, setPhotoVer] = useState(0);
  const [error, setError] = useState('');

  function load() { client.get('/accidents').then(r => setAccidents(r.data)).catch(() => {}); }
  useEffect(() => {
    if (!canView) return;
    load();
    client.get('/vehicles').then(r => setVehicles(r.data)).catch(() => {});
  }, [canView]);

  if (!canView) return <div><LogistiqueSubnav /><p>Cet écran du module Logistique ne vous a pas été accordé.</p></div>;

  async function declare(e) {
    e.preventDefault();
    if (!form.vehicle_id || !form.description.trim()) { setError('Véhicule et description obligatoires.'); return; }
    setError('');
    try {
      const { data } = await client.post('/accidents', {
        vehicle_id: Number(form.vehicle_id), description: form.description, localisation: form.localisation, tiers_implique: form.tiers_implique,
      });
      for (const f of form.files) { const fd = new FormData(); fd.append('file', f); await client.post(`/accidents/${data.id}/photos`, fd).catch(() => {}); }
      setForm(emptyForm()); setShowForm(false); load();
    } catch (err) { setError(err.response?.data?.error || 'Erreur.'); }
  }
  async function changeStatut(a, statut) { await client.put(`/accidents/${a.id}`, { statut }); load(); if (current && current.id === a.id) setCurrent(c => ({ ...c, statut })); }
  async function removeAccident(a) { if (!window.confirm(`Supprimer l'accident ${a.reference} ?`)) return; await client.delete(`/accidents/${a.id}`); if (current && current.id === a.id) setCurrent(null); load(); }
  async function openDetail(id) { const { data } = await client.get(`/accidents/${id}`); setCurrent(data); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
  async function addPhoto(id, file) { if (!file) return; const fd = new FormData(); fd.append('file', file); await client.post(`/accidents/${id}/photos`, fd); await openDetail(id); setPhotoVer(v => v + 1); load(); }
  async function removePhoto(photoId) { await client.delete(`/accidents/photos/${photoId}`); if (current) await openDetail(current.id); setPhotoVer(v => v + 1); load(); }

  const vLabel = v => `${v.immatriculation}${v.marque ? ' — ' + v.marque : ''}`;

  return (
    <div>
      <LogistiqueSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Accidents</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>Déclaration et suivi des accidents véhicule.</p>
        </div>
        {canAdd && <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setError(''); }}>{showForm ? 'Annuler' : '+ Déclarer un accident'}</button>}
      </div>

      {showForm && canAdd && (
        <section className="card">
          <form onSubmit={declare} className="form-grid" style={{ maxWidth: 560 }}>
            <label className="field">Véhicule
              <select value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))} required>
                <option value="" disabled>Choisir un véhicule</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{vLabel(v)}</option>)}
              </select>
            </label>
            <label className="field">Description
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required placeholder="Circonstances de l'accident…" />
            </label>
            <label className="field">Localisation
              <input value={form.localisation} onChange={e => setForm(f => ({ ...f, localisation: e.target.value }))} placeholder="Lieu (optionnel)" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={form.tiers_implique} onChange={e => setForm(f => ({ ...f, tiers_implique: e.target.checked }))} /> Tiers impliqué
            </label>
            <label className="field">Justificatifs / photos (optionnel)
              <input type="file" accept="image/png,image/jpeg" multiple onChange={e => setForm(f => ({ ...f, files: [...e.target.files] }))} />
            </label>
            {error && <div className="alert alert-danger">{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>Déclarer un accident</button>
          </form>
        </section>
      )}

      {accidents.length === 0 && <p className="empty-row">Aucun accident déclaré.</p>}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Réf.</th><th>Véhicule</th><th>Description</th><th>Tiers</th><th>Justif.</th><th>Statut</th>{canEdit && <th className="sticky-col" />}</tr></thead>
            <tbody>
              {accidents.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.reference}</strong></td>
                  <td>{a.vehicle_immat}</td>
                  <td>{a.description}</td>
                  <td>{a.tiers_implique ? 'Oui' : 'Non'}</td>
                  <td>{a.n_photos > 0 ? `📎 ${a.n_photos}` : '—'}</td>
                  <td>{canEdit ? <select value={a.statut} onChange={e => changeStatut(a, e.target.value)}>{STATUTS.map(s => <option key={s} value={s}>{s}</option>)}</select> : a.statut}</td>
                  {canEdit && (
                    <td className="sticky-col" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => openDetail(a.id)}>Justificatifs</button>
                      <button className="btn btn-danger btn-sm" onClick={() => removeAccident(a)}>Supprimer</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {current && (
        <section className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{current.reference} — {current.vehicle_immat}</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setCurrent(null)}>Fermer</button>
          </div>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>{current.statut}{current.tiers_implique ? ' · Tiers impliqué' : ''}{current.localisation ? ` · ${current.localisation}` : ''}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {(current.photos || []).map(ph => (
              <div key={`${ph.id}-${photoVer}`} style={{ position: 'relative' }}>
                <AuthImage src={`/accidents/photos/${ph.id}`} alt="Justificatif" style={{ height: 110, borderRadius: 8, border: '1px solid var(--color-border)', display: 'block' }} />
                {canEdit && <button className="btn btn-danger-ghost btn-sm" style={{ position: 'absolute', top: 4, right: 4 }} onClick={() => removePhoto(ph.id)}>×</button>}
              </div>
            ))}
            {(current.photos || []).length === 0 && <span className="empty-row">Aucun justificatif.</span>}
          </div>
          {canAdd && (
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginTop: 12, display: 'inline-block' }}>
              + Ajouter un justificatif
              <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={e => { addPhoto(current.id, e.target.files[0]); e.target.value = ''; }} />
            </label>
          )}
        </section>
      )}
    </div>
  );
}
