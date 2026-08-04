import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';

const EMPTY = { titre: '', type: 'info', contenu: '', date_evenement: '', lieu: '' };
const TYPE_META = {
  info: { label: 'Info', bg: 'var(--status-blue-bg)', fg: 'var(--status-blue-fg)' },
  evenement: { label: 'Événement', bg: 'var(--status-amber-bg)', fg: 'var(--status-amber-fg)' },
};

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const canAdd = hasSubModuleLevel(user, 'annonces', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'annonces', 'edition');

  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function load() { client.get('/announcements').then(r => setItems(r.data)); }
  useEffect(() => { load(); }, []);

  function openCreate() { setForm(EMPTY); setEditId(null); setError(''); setShowForm(true); }
  function openEdit(a) {
    setForm({ titre: a.titre, type: a.type, contenu: a.contenu || '', date_evenement: a.date_evenement ? String(a.date_evenement).slice(0, 10) : '', lieu: a.lieu || '' });
    setEditId(a.id); setError(''); setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.titre.trim()) { setError('Le titre est obligatoire.'); return; }
    setError(''); setBusy(true);
    try {
      if (editId) await client.put(`/announcements/${editId}`, form);
      else await client.post('/announcements', form);
      setShowForm(false); setForm(EMPTY); setEditId(null); load();
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue.');
    } finally { setBusy(false); }
  }

  async function remove(a) {
    if (!window.confirm(`Supprimer « ${a.titre} » ?`)) return;
    await client.delete(`/announcements/${a.id}`);
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Infos & Événements</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>Actualités et annonces d'événements du groupe.</p>
        </div>
        {canAdd && <button className="btn btn-primary" onClick={showForm ? () => setShowForm(false) : openCreate}>{showForm ? 'Annuler' : '+ Publier'}</button>}
      </div>

      {showForm && canAdd && (
        <section className="card">
          <form onSubmit={save} className="form-grid" style={{ maxWidth: 620 }}>
            <label className="field">
              Titre
              <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} required />
            </label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="type" checked={form.type === 'info'} onChange={() => setForm(f => ({ ...f, type: 'info' }))} /> Info
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="type" checked={form.type === 'evenement'} onChange={() => setForm(f => ({ ...f, type: 'evenement' }))} /> Événement
              </label>
            </div>
            {form.type === 'evenement' && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <label className="field" style={{ flex: '1 1 160px' }}>
                  Date de l'événement
                  <input type="date" value={form.date_evenement} onChange={e => setForm(f => ({ ...f, date_evenement: e.target.value }))} />
                </label>
                <label className="field" style={{ flex: '1 1 200px' }}>
                  Lieu
                  <input value={form.lieu} onChange={e => setForm(f => ({ ...f, lieu: e.target.value }))} placeholder="ex. Siège CCG, Conakry" />
                </label>
              </div>
            )}
            <label className="field">
              Contenu
              <textarea value={form.contenu} onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))} rows={4} placeholder="Rédigez votre annonce…" />
            </label>
            {error && <div className="alert alert-danger">{error}</div>}
            <button type="submit" disabled={busy} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              {busy ? 'Publication…' : (editId ? 'Enregistrer' : 'Publier')}
            </button>
          </form>
        </section>
      )}

      {items.length === 0 && <p className="empty-row">Aucune annonce pour le moment.</p>}

      {items.map(a => {
        const meta = TYPE_META[a.type] || TYPE_META.info;
        return (
          <div key={a.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <span className="badge" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>
                {' '}<strong style={{ fontSize: 16 }}>{a.titre}</strong>
                {a.type === 'evenement' && (a.date_evenement || a.lieu) && (
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {a.date_evenement ? `📅 ${new Date(a.date_evenement).toLocaleDateString('fr-FR')}` : ''}
                    {a.date_evenement && a.lieu ? ' · ' : ''}
                    {a.lieu ? `📍 ${a.lieu}` : ''}
                  </div>
                )}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>Éditer</button>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(a)}>Supprimer</button>
                </div>
              )}
            </div>
            {a.contenu && <p style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{a.contenu}</p>}
            <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 10 }}>
              {a.author_nom ? `${a.author_prenom} ${a.author_nom} · ` : ''}{new Date(a.created_at).toLocaleDateString('fr-FR')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
