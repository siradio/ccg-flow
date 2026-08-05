import { useEffect, useState } from 'react';
import { useParams, NavLink, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';

// Normalise l'URL saisie pour un lien cliquable : sans schéma, on préfixe https:// (sinon le
// navigateur l'interpréterait comme un chemin relatif à l'app).
function hrefOf(url) {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
}

export default function LiensPage() {
  const { user } = useAuth();
  const { categorie } = useParams();
  const navigate = useNavigate();
  const canAdd = hasSubModuleLevel(user, 'liens', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'liens', 'edition');

  const [categories, setCategories] = useState([]);
  const [links, setLinks] = useState([]);
  const [form, setForm] = useState({ titre: '', description: '', url: '' });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newCat, setNewCat] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const currentSlug = categorie || (categories[0] && categories[0].slug);
  const currentCat = categories.find(c => c.slug === currentSlug);

  useEffect(() => { client.get('/liens/categories').then(r => setCategories(r.data)); }, []);

  function loadLinks(slug) {
    if (!slug) { setLinks([]); return; }
    client.get('/liens', { params: { category: slug } }).then(r => setLinks(r.data));
  }
  useEffect(() => { loadLinks(currentSlug); }, [currentSlug]);

  async function addLink(e) {
    e.preventDefault();
    if (!form.titre.trim() || !form.url.trim()) { setError('Le titre et le lien (URL) sont obligatoires.'); return; }
    setError(''); setBusy(true);
    try {
      await client.post('/liens', { ...form, category: currentSlug });
      setForm({ titre: '', description: '', url: '' });
      setShowForm(false);
      loadLinks(currentSlug);
    } catch (err) {
      setError(err.response?.data?.error || 'Échec de l’ajout du lien.');
    } finally { setBusy(false); }
  }

  async function remove(l) {
    if (!window.confirm(`Supprimer « ${l.titre} » ?`)) return;
    await client.delete(`/liens/${l.id}`);
    loadLinks(currentSlug);
  }

  async function refreshCategories() {
    const r = await client.get('/liens/categories');
    setCategories(r.data);
    return r.data;
  }

  async function addCategory() {
    if (!newCat.trim()) return;
    setError('');
    try {
      const { data } = await client.post('/liens/categories', { nom: newCat.trim() });
      setNewCat('');
      setShowNewCat(false);
      await refreshCategories();
      navigate(`/liens/${data.slug}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Échec de l’ajout de la catégorie.');
    }
  }

  async function renameCategory() {
    if (!currentCat || !renameValue.trim()) return;
    setError('');
    try {
      await client.put(`/liens/categories/${currentCat.id}`, { nom: renameValue.trim() });
      setRenaming(false);
      await refreshCategories();
    } catch (err) {
      setError(err.response?.data?.error || 'Échec du renommage.');
    }
  }

  async function deleteCategory() {
    if (!currentCat) return;
    if (!window.confirm(`Supprimer la catégorie « ${currentCat.nom} » ? Les liens qu'elle contient sont conservés (ils deviennent « sans catégorie »).`)) return;
    setError('');
    try {
      await client.delete(`/liens/categories/${currentCat.id}`);
      const cats = await refreshCategories();
      navigate(cats.length ? `/liens/${cats[0].slug}` : '/liens');
    } catch (err) {
      setError(err.response?.data?.error || 'Échec de la suppression.');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Liens utiles</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{currentCat ? currentCat.nom : 'Manuels de procédure, templates et autres liens utiles.'}</p>
        </div>
        {canAdd && currentSlug && (
          <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setError(''); }}>
            {showForm ? 'Annuler' : '+ Ajouter un lien'}
          </button>
        )}
      </div>

      {/* Sous-menus (catégories) — également dans la barre de navigation. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {categories.map(c => (
          <NavLink key={c.id} to={`/liens/${c.slug}`}
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
          <form onSubmit={addLink} className="form-grid" style={{ maxWidth: 560 }}>
            <label className="field">
              Titre
              <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} required placeholder="ex. Procédure Achats — Intranet" />
            </label>
            <label className="field">
              Description
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Courte description (optionnel)" />
            </label>
            <label className="field">
              Lien (URL)
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} required placeholder="https://…" />
            </label>
            {error && <div className="alert alert-danger">{error}</div>}
            <button type="submit" disabled={busy} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              {busy ? 'Ajout…' : `Ajouter dans « ${currentCat ? currentCat.nom : ''} »`}
            </button>
          </form>
        </section>
      )}

      {error && !showForm && <div className="alert alert-danger">{error}</div>}
      {links.length === 0 && <p className="empty-row">Aucun lien dans cette catégorie.</p>}

      {links.map(l => (
        <div key={l.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <a href={hrefOf(l.url)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, fontSize: 15 }}>{l.titre}</a>
            {l.description && <div style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 4 }}>{l.description}</div>}
            <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 6, wordBreak: 'break-all' }}>
              {l.url}
              {l.auteur_nom ? ` · ajouté par ${l.auteur_prenom} ${l.auteur_nom}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <a className="btn btn-secondary btn-sm" href={hrefOf(l.url)} target="_blank" rel="noopener noreferrer">Ouvrir</a>
            {canEdit && <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(l)}>Supprimer</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
