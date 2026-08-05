import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';

const TYPES = ['Départ', 'Retour', 'Hebdomadaire', 'Autre'];
const emptyForm = () => ({ id: null, nom: '', type: 'Départ', items: [''] });

export default function ChecklistsPage() {
  const { user } = useAuth();
  const canView = hasSubModuleLevel(user, 'logistique.checklists');
  const canAdd = hasSubModuleLevel(user, 'logistique.checklists', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'logistique.checklists', 'edition');

  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function load() { client.get('/checklists/templates').then(r => setTemplates(r.data)).catch(() => {}); }
  useEffect(() => { if (canView) load(); }, [canView]);

  if (!canView) return <div><LogistiqueSubnav /><p>Cet écran du module Logistique ne vous a pas été accordé.</p></div>;

  function startCreate() { setForm(emptyForm()); setShowForm(true); setError(''); }
  function startEdit(t) {
    setForm({ id: t.id, nom: t.nom, type: t.type, items: t.items.length ? t.items.map(i => i.libelle) : [''] });
    setShowForm(true); setError('');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  function cancel() { setShowForm(false); setForm(emptyForm()); setError(''); }

  function setItem(i, v) { setForm(f => ({ ...f, items: f.items.map((x, j) => (j === i ? v : x)) })); }
  function addItem() { setForm(f => ({ ...f, items: [...f.items, ''] })); }
  function removeItem(i) { setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) })); }

  async function save(e) {
    e.preventDefault();
    if (!form.nom.trim()) { setError('Le nom du modèle est obligatoire.'); return; }
    const items = form.items.map(s => s.trim()).filter(Boolean);
    if (items.length === 0) { setError('Ajoutez au moins un item à contrôler.'); return; }
    setError('');
    try {
      if (form.id) await client.put(`/checklists/templates/${form.id}`, { nom: form.nom, type: form.type, items });
      else await client.post('/checklists/templates', { nom: form.nom, type: form.type, items });
      cancel(); load();
    } catch (err) { setError(err.response?.data?.error || 'Erreur.'); }
  }

  async function remove(t) {
    if (!window.confirm(`Supprimer le modèle « ${t.nom} » ?`)) return;
    await client.delete(`/checklists/templates/${t.id}`);
    load();
  }

  return (
    <div>
      <LogistiqueSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Checklists chauffeurs — modèles</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>Définissez les contrôles (départ, retour…) que les chauffeurs auront à remplir.</p>
        </div>
        {canAdd && (
          <button className="btn btn-primary" onClick={showForm && !form.id ? cancel : startCreate}>
            {showForm && !form.id ? 'Annuler' : '+ Nouveau modèle'}
          </button>
        )}
      </div>

      {templates.length === 0 && <p className="empty-row">Aucun modèle de checklist.{canAdd ? ' Créez-en un.' : ''}</p>}

      {templates.map(t => (
        <div key={t.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong>{t.nom}</strong>{' '}
            <span className="badge" style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>{t.type}</span>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14, color: 'var(--color-text-muted)' }}>
              {t.items.map(i => <li key={i.id}>{i.libelle}</li>)}
              {t.items.length === 0 && <li style={{ listStyle: 'none', color: 'var(--color-text-faint)' }}>Aucun item.</li>}
            </ul>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => startEdit(t)}>Éditer</button>
              <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(t)}>Supprimer</button>
            </div>
          )}
        </div>
      ))}

      {showForm && (canAdd || (form.id && canEdit)) && (
        <section className="card" style={{ marginTop: 8 }}>
          <form onSubmit={save} className="form-grid" style={{ maxWidth: 560 }}>
            <strong style={{ fontSize: 15 }}>{form.id ? 'Modifier le modèle' : 'Nouveau modèle'}</strong>
            <label className="field">
              Nom
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required placeholder="ex. Contrôle départ camion" />
            </label>
            <label className="field">
              Type
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <div className="field">
              Items à contrôler
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {form.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input value={it} onChange={e => setItem(i, e.target.value)} placeholder={`Item ${i + 1} (ex. Niveau d'huile)`} style={{ flex: 1 }} />
                    <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => removeItem(i)} disabled={form.items.length <= 1} title="Retirer">×</button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ alignSelf: 'flex-start' }}>+ Ajouter un item</button>
              </div>
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary">{form.id ? 'Enregistrer' : 'Créer le modèle'}</button>
              <button type="button" className="btn btn-secondary" onClick={cancel}>Annuler</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
