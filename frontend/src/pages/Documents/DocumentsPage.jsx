import { useEffect, useState } from 'react';
import { useParams, NavLink, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';

async function downloadFile(id, filename) {
  const res = await client.get(`/documents/${id}/file`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const { categorie } = useParams();
  const navigate = useNavigate();
  const canAdd = hasSubModuleLevel(user, 'documents', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'documents', 'edition');

  const [categories, setCategories] = useState([]);
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({ nom: '', description: '', file: null });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newCat, setNewCat] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const currentSlug = categorie || (categories[0] && categories[0].slug);
  const currentCat = categories.find(c => c.slug === currentSlug);

  useEffect(() => { client.get('/documents/categories').then(r => setCategories(r.data)); }, []);

  function loadDocs(slug) {
    if (!slug) { setDocs([]); return; }
    client.get('/documents', { params: { category: slug } }).then(r => setDocs(r.data));
  }
  useEffect(() => { loadDocs(currentSlug); }, [currentSlug]);

  async function upload(e) {
    e.preventDefault();
    if (!form.nom.trim() || !form.file) { setError('Le nom et le fichier sont obligatoires.'); return; }
    setError(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('nom', form.nom);
      fd.append('description', form.description);
      fd.append('file', form.file);
      if (currentSlug) fd.append('category', currentSlug);
      await client.post('/documents', fd);
      setForm({ nom: '', description: '', file: null });
      setShowForm(false);
      loadDocs(currentSlug);
    } catch (err) {
      setError(err.response?.data?.error || 'Échec du téléversement.');
    } finally { setBusy(false); }
  }

  async function remove(d) {
    if (!window.confirm(`Supprimer « ${d.nom} » ?`)) return;
    await client.delete(`/documents/${d.id}`);
    loadDocs(currentSlug);
  }

  async function refreshCategories() {
    const r = await client.get('/documents/categories');
    setCategories(r.data);
    return r.data;
  }

  async function addCategory() {
    if (!newCat.trim()) return;
    setError('');
    try {
      const { data } = await client.post('/documents/categories', { nom: newCat.trim() });
      setNewCat('');
      setShowNewCat(false);
      await refreshCategories();
      navigate(`/documents/${data.slug}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Échec de l’ajout de la catégorie.');
    }
  }

  async function renameCategory() {
    if (!currentCat || !renameValue.trim()) return;
    setError('');
    try {
      await client.put(`/documents/categories/${currentCat.id}`, { nom: renameValue.trim() });
      setRenaming(false);
      await refreshCategories();
    } catch (err) {
      setError(err.response?.data?.error || 'Échec du renommage.');
    }
  }

  async function deleteCategory() {
    if (!currentCat) return;
    if (!window.confirm(`Supprimer la catégorie « ${currentCat.nom} » ? Les documents qu'elle contient sont conservés (ils deviennent « sans catégorie »).`)) return;
    setError('');
    try {
      await client.delete(`/documents/categories/${currentCat.id}`);
      const cats = await refreshCategories();
      navigate(cats.length ? `/documents/${cats[0].slug}` : '/documents');
    } catch (err) {
      setError(err.response?.data?.error || 'Échec de la suppression.');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Documents</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{currentCat ? currentCat.nom : 'Manuels de procédures, templates et autres documents.'}</p>
        </div>
        {canAdd && currentSlug && (
          <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setError(''); }}>
            {showForm ? 'Annuler' : '+ Ajouter un document'}
          </button>
        )}
      </div>

      {/* Sous-menus (catégories) — également dans la barre de navigation. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {categories.map(c => (
          <NavLink key={c.id} to={`/documents/${c.slug}`}
            className={c.slug === currentSlug ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}>
            {c.nom}
          </NavLink>
        ))}
        {canEdit && (
          showNewCat ? (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nom de la catégorie"
                style={{ fontSize: 13, padding: '4px 8px' }} />
              <button className="btn btn-primary btn-sm" onClick={addCategory} disabled={!newCat.trim()}>Ajouter</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowNewCat(false); setNewCat(''); }}>Annuler</button>
            </span>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNewCat(true)}>+ Catégorie</button>
          )
        )}
      </div>

      {canEdit && currentCat && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          {renaming ? (
            <>
              <input value={renameValue} onChange={e => setRenameValue(e.target.value)} style={{ fontSize: 13, padding: '4px 8px', minWidth: 200 }} />
              <button className="btn btn-primary btn-sm" onClick={renameCategory} disabled={!renameValue.trim()}>Enregistrer</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setRenaming(false)}>Annuler</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Catégorie « {currentCat.nom} » :</span>
              <button className="btn btn-secondary btn-sm" onClick={() => { setRenaming(true); setRenameValue(currentCat.nom); }}>Renommer</button>
              <button className="btn btn-danger-ghost btn-sm" onClick={deleteCategory}>Supprimer</button>
            </>
          )}
        </div>
      )}

      {showForm && canAdd && (
        <section className="card">
          <form onSubmit={upload} className="form-grid" style={{ maxWidth: 560 }}>
            <label className="field">
              Nom
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required placeholder="ex. Procédure Achats — v2" />
            </label>
            <label className="field">
              Description
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Courte description (optionnel)" />
            </label>
            <label className="field">
              Fichier
              <input type="file" onChange={e => setForm(f => ({ ...f, file: e.target.files[0] }))} required />
            </label>
            {error && <div className="alert alert-danger">{error}</div>}
            <button type="submit" disabled={busy} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              {busy ? 'Téléversement…' : `Téléverser dans « ${currentCat ? currentCat.nom : ''} »`}
            </button>
          </form>
        </section>
      )}

      {error && !showForm && <div className="alert alert-danger">{error}</div>}
      {docs.length === 0 && <p className="empty-row">Aucun document dans cette catégorie.</p>}

      {docs.map(d => (
        <div key={d.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong>{d.nom}</strong>
            {d.description && <div style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 4 }}>{d.description}</div>}
            <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 6 }}>
              {d.filename} · ajouté le {new Date(d.created_at).toLocaleDateString('fr-FR')}
              {d.uploader_nom ? ` par ${d.uploader_prenom} ${d.uploader_nom}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(d.id, d.filename)}>Télécharger</button>
            {canEdit && <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(d)}>Supprimer</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
