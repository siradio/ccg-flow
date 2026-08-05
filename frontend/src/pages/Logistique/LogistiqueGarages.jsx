import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';

const emptyForm = () => ({ id: null, nom: '', ville: '', sous_contrat: false, specialites: '', efficacite_pct: '', telephone: '', notes: '', actif: true });
const nb = n => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));

export default function LogistiqueGarages() {
  const { user } = useAuth();
  const canView = hasSubModuleLevel(user, 'logistique.maintenance');
  const canAdd = hasSubModuleLevel(user, 'logistique.maintenance', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'logistique.maintenance', 'edition');

  const [garages, setGarages] = useState([]);
  const [reparations, setReparations] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function load() {
    client.get('/garages/with-stats').then(r => setGarages(r.data)).catch(() => {});
    client.get('/reparations', { params: { en_cours: true } }).then(r => setReparations(r.data)).catch(() => {});
  }
  useEffect(() => { if (canView) load(); }, [canView]);

  if (!canView) return <div><LogistiqueSubnav /><p>Cet écran du module Logistique ne vous a pas été accordé.</p></div>;

  function startCreate() { setForm(emptyForm()); setShowForm(true); setError(''); }
  function startEdit(g) { setForm({ ...emptyForm(), ...g, efficacite_pct: g.efficacite_pct ?? '' }); setShowForm(true); setError(''); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
  function cancel() { setShowForm(false); setForm(emptyForm()); setError(''); }

  async function save(e) {
    e.preventDefault();
    if (!form.nom.trim()) { setError('Le nom du garage est obligatoire.'); return; }
    setError('');
    const body = { nom: form.nom, ville: form.ville, sous_contrat: form.sous_contrat, specialites: form.specialites, efficacite_pct: form.efficacite_pct === '' ? null : Number(form.efficacite_pct), telephone: form.telephone, notes: form.notes, actif: form.actif };
    try {
      if (form.id) await client.put(`/garages/${form.id}`, body);
      else await client.post('/garages', body);
      cancel(); load();
    } catch (err) { setError(err.response?.data?.error || 'Erreur.'); }
  }
  async function remove(g) {
    if (!window.confirm(`Supprimer le garage « ${g.nom} » ?`)) return;
    await client.delete(`/garages/${g.id}`);
    load();
  }
  async function closeReparation(r) {
    const cout = window.prompt('Coût final de la réparation (laisser vide pour garder l\'actuel) :', r.cout ?? '');
    if (cout === null) return;
    await client.post(`/reparations/${r.id}/close`, cout.trim() ? { cout: Number(cout) } : {});
    load();
  }

  const totalCout = garages.reduce((s, g) => s + (g.cout_total || 0), 0);
  const enReparation = reparations.length;
  const sousContrat = garages.filter(g => g.sous_contrat).length;

  return (
    <div>
      <LogistiqueSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Garages partenaires &amp; réparations</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>Garages partenaires (référentiel). Chaque panne est réparée chez un garage — sous contrat ou non.</p>
        </div>
        {canAdd && <button className="btn btn-primary" onClick={showForm && !form.id ? cancel : startCreate}>{showForm && !form.id ? 'Annuler' : '+ Nouveau garage'}</button>}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="card" style={{ flex: '1 1 160px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Garages partenaires</div><div style={{ fontSize: 26, fontWeight: 800 }}>{garages.length}</div><div style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>{sousContrat} sous contrat</div></div>
        <div className="card" style={{ flex: '1 1 160px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Véhicules en réparation</div><div style={{ fontSize: 26, fontWeight: 800, color: enReparation ? 'var(--status-amber-fg)' : 'var(--color-text)' }}>{enReparation}</div></div>
        <div className="card" style={{ flex: '1 1 160px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Coût total réparations</div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-primary)' }}>{nb(totalCout)}</div></div>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Garage</th><th>Ville</th><th>Contrat</th><th>En réparation</th><th>Durée moy.</th><th>Coût total</th><th>Efficacité</th>{canEdit && <th className="sticky-col" />}</tr></thead>
            <tbody>
              {garages.map(g => (
                <tr key={g.id}>
                  <td><strong>{g.nom}</strong>{g.specialites ? <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{g.specialites}</div> : null}</td>
                  <td>{g.ville || '—'}</td>
                  <td>{g.sous_contrat ? <span className="badge" style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-fg)' }}>Sous contrat</span> : <span style={{ color: 'var(--color-text-faint)' }}>Hors contrat</span>}</td>
                  <td>{g.en_reparation > 0 ? <span className="badge" style={{ background: 'var(--status-amber-bg)', color: 'var(--status-amber-fg)' }}>{g.en_reparation}</span> : '—'}</td>
                  <td>{g.duree_moy_jours != null ? `${g.duree_moy_jours.toFixed(1)} j` : '—'}</td>
                  <td>{nb(g.cout_total)}</td>
                  <td>{g.efficacite_pct != null ? `${g.efficacite_pct} %` : '—'}</td>
                  {canEdit && (
                    <td className="sticky-col" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => startEdit(g)}>Éditer</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(g)}>Supprimer</button>
                    </td>
                  )}
                </tr>
              ))}
              {garages.length === 0 && <tr><td className="empty-row" colSpan={8}>Aucun garage.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <h2 style={{ margin: '0 0 8px' }}>Réparations en cours</h2>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Véhicule</th><th>Garage</th><th>Panne</th><th>Depuis</th>{canEdit && <th className="sticky-col" />}</tr></thead>
            <tbody>
              {reparations.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.vehicle_immat || '—'}</strong></td>
                  <td>{r.garage_nom || '—'}</td>
                  <td>{r.panne_ref || '—'}</td>
                  <td>{new Date(r.date_debut).toLocaleString('fr-FR')}</td>
                  {canEdit && <td className="sticky-col"><button className="btn btn-secondary btn-sm" onClick={() => closeReparation(r)}>Clôturer</button></td>}
                </tr>
              ))}
              {reparations.length === 0 && <tr><td className="empty-row" colSpan={5}>Aucune réparation en cours.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (canAdd || (form.id && canEdit)) && (
        <section className="card" style={{ marginTop: 16 }}>
          <form onSubmit={save} className="form-inline" style={{ flexWrap: 'wrap', maxWidth: 'none' }}>
            <strong style={{ width: '100%', fontSize: 15 }}>{form.id ? 'Modifier le garage' : 'Nouveau garage'}</strong>
            <label className="field">Nom<input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required /></label>
            <label className="field">Ville<input value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} /></label>
            <label className="field">Spécialités<input value={form.specialites} onChange={e => setForm(f => ({ ...f, specialites: e.target.value }))} placeholder="moteur · freinage" /></label>
            <label className="field">Efficacité (%)<input type="number" value={form.efficacite_pct} onChange={e => setForm(f => ({ ...f, efficacite_pct: e.target.value }))} /></label>
            <label className="field">Téléphone<input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={form.sous_contrat} onChange={e => setForm(f => ({ ...f, sous_contrat: e.target.checked }))} /> Sous contrat</label>
            {error && <div className="alert alert-danger" style={{ width: '100%' }}>{error}</div>}
            <button type="submit" className="btn btn-primary">{form.id ? 'Enregistrer' : 'Créer le garage'}</button>
            <button type="button" className="btn btn-secondary" onClick={cancel}>Annuler</button>
          </form>
        </section>
      )}
    </div>
  );
}
