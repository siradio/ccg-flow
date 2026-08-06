import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../../api/client';
import { useConfirm } from '../../../components/ConfirmProvider.jsx';
import { ROLE_CODES, userStatus, STATUS_META, StatusBadge } from './shared.jsx';

const PAGE_SIZE = 20;

export default function ListPage() {
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [moduleCatalog, setModuleCatalog] = useState([]);
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', password: '', notify: true });
  const [notice, setNotice] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [profiles, setProfiles] = useState([]); // profils d'accès réutilisables
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState({ active: true, inactive: true, pending: true, rejected: true });
  const [rejectPanel, setRejectPanel] = useState({}); // { [userId]: note } — panneau de rejet ouvert (ligne dépliée)
  const [page, setPage] = useState(1);

  // key de sous-module -> libellé lisible, pour la colonne "Module" (un module sans sous-modules
  // EST lui-même l'unité accordable — voir backend/src/config/modules.js).
  const moduleLabelByKey = useMemo(() => {
    const map = {};
    for (const mod of moduleCatalog) {
      if (mod.subModules.length) mod.subModules.forEach(sm => { map[sm.key] = sm.label; });
      else map[mod.key] = mod.label;
    }
    return map;
  }, [moduleCatalog]);

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search || `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(search.toLowerCase());
    const matchesRole = !roleFilter || u.roles.some(r => r.role_code === roleFilter);
    const matchesStatus = statusFilter[userStatus(u)];
    return matchesSearch && matchesRole && matchesStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Un filtre plus restrictif peut faire disparaître la page courante (ex. page 3 sur un filtre qui
  // ne laisse qu'une page) — on revient sur la dernière page valide plutôt que d'afficher un tableau vide.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  // Changer un filtre repart de la page 1 — sinon on peut se retrouver sur une page 3 devenue
  // incohérente avec les nouveaux résultats filtrés.
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  function load() { client.get('/users').then(res => setUsers(res.data)); }
  function loadProfiles() { client.get('/access-profiles').then(res => setProfiles(res.data)); }
  useEffect(() => {
    load();
    loadProfiles();
    client.get('/users/sub-module-catalog').then(res => setModuleCatalog(res.data));
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setError('');
    setNotice(null);
    try {
      const payload = { ...form, copyFromUserId: form.copyFromUserId ? Number(form.copyFromUserId) : undefined };
      const { data } = await client.post('/users', payload);
      // Application d'un profil juste après la création (option du formulaire) — additif au compte créé.
      if (form.applyProfileId && data?.id) {
        try { await client.post(`/access-profiles/${form.applyProfileId}/apply/${data.id}`); } catch { /* non bloquant : le compte est créé */ }
      }
      const who = `${form.prenom} ${form.nom} (${form.email})`;
      if (form.notify && data.notification?.sent) {
        setNotice({ type: 'success', text: `Utilisateur créé. Identifiants envoyés par email à ${form.email}.` });
      } else if (form.notify && !data.notification?.sent) {
        const pw = data.generatedPassword ? ` Mot de passe généré : ${data.generatedPassword} — à communiquer manuellement.` : ' Communiquez-lui manuellement le mot de passe saisi.';
        setNotice({ type: 'warning', text: `Utilisateur créé, mais l'email n'a pas pu être envoyé${data.notification?.error ? ` (${data.notification.error})` : ''}.${pw}` });
      } else if (data.generatedPassword) {
        setNotice({ type: 'success', text: `Utilisateur ${who} créé. Mot de passe : ${data.generatedPassword} — à lui communiquer (il pourra le changer ensuite).` });
      } else {
        setNotice({ type: 'success', text: `Utilisateur ${who} créé.` });
      }
      setForm({ nom: '', prenom: '', email: '', password: '', notify: true });
      setShowCreateForm(false);
      load();
    } catch (err) { setError(err.response?.data?.error || 'Erreur.'); }
  }

  async function deleteProfile(id, nom) {
    if (!(await confirm(`Désactiver  le profil « ${nom} » ? Les utilisateurs déjà désactivés ne sont pas modifiés.`, { danger: true, confirmLabel: 'Désactiver ' }))) return;
    setError(''); setNotice(null);
    try {
      await client.delete(`/access-profiles/${id}`);
      loadProfiles();
    } catch (err) { setError(err.response?.data?.error || 'Échec de la suppression du profil.'); }
  }

  // --- Demandes d'accès (statut "à valider") -------------------------------------------------
  async function approveAccess(u) {
    if (!(await confirm(`Valider l'accès de ${u.prenom} ${u.nom} ? Un mot de passe lui sera généré et envoyé par email à ${u.email}.`, { confirmLabel: 'Valider' }))) return;
    setError(''); setNotice(null); setSendingId(u.id);
    try {
      const { data } = await client.post(`/users/${u.id}/approve-access`);
      if (data.notification?.sent) {
        setNotice({ type: 'success', text: `Accès validé. Identifiants envoyés par email à ${u.email}.` });
      } else {
        setNotice({ type: 'warning', text: `Accès validé, mais l'email n'a pas pu être envoyé. Mot de passe généré : ${data.generatedPassword} — à communiquer manuellement.` });
      }
      load();
    } catch (err) { setError(err.response?.data?.error || 'Échec de la validation.'); }
    finally { setSendingId(null); }
  }

  function toggleReject(u) {
    setRejectPanel(p => (p[u.id] !== undefined ? (() => { const n = { ...p }; delete n[u.id]; return n; })() : { ...p, [u.id]: '' }));
  }
  async function rejectAccess(u) {
    const note = rejectPanel[u.id] || '';
    setError(''); setNotice(null); setSendingId(u.id);
    try {
      await client.post(`/users/${u.id}/reject-access`, { note });
      setNotice({ type: 'success', text: `Demande de ${u.email} rejetée${note.trim() ? ' (motif envoyé par email)' : ''}.` });
      setRejectPanel(p => { const n = { ...p }; delete n[u.id]; return n; });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Échec du rejet.'); }
    finally { setSendingId(null); }
  }

  // La colonne Action "Supprimer" désactive le compte (actif=false) : pas de suppression définitive
  // en base, la table users étant référencée par les demandes d'achat, l'audit, les mouvements de
  // stock, etc. — désactiver reste réversible ("Réactiver") et ne casse aucun historique.
  async function toggleActive(u) {
    const action = u.actif ? 'la désactivation du profile de ' : 'la réactivation  du profile de';
    if (!(await confirm(`Confirmer : ${action} ${u.prenom} ${u.nom} ?`, { danger: u.actif, confirmLabel: u.actif ? 'Désactiver ' : 'Réactiver' }))) return;
    setError('');
    setNotice(null);
    try {
      await client.put(`/users/${u.id}`, { actif: !u.actif });
      setNotice({ type: 'success', text: `${u.prenom} ${u.nom} ${u.actif ? 'désactivé' : 'réactivé'}.` });
      load();
    } catch (err) {
      const action = u.actif ? 'désactiver' : 'réactiver';
      setError(err.response?.data?.error || `Impossible de ${action} cet utilisateur.`);
    }
  }

  function roleSummary(u) {
    if (u.roles.length === 0) return <span className="empty-row">—</span>;
    return [...new Set(u.roles.map(r => r.role_code))].join(', ');
  }

  function moduleSummary(u) {
    const granted = u.subModules.filter(s => s.niveau);
    if (granted.length === 0) return <span className="empty-row">—</span>;
    return granted.map(s => moduleLabelByKey[s.sub_module_key] || s.sub_module_key).join(', ');
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Utilisateurs</h1>
        <button onClick={() => setShowCreateForm(o => !o)} className="btn btn-primary">
          {showCreateForm ? 'Annuler' : '+ Ajouter un utilisateur'}
        </button>
      </div>

      {showCreateForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Nouvel utilisateur</h2>
          <form onSubmit={createUser} className="form-inline">
            <input placeholder="Nom" required value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
            <input placeholder="Prénom" required value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
            <input placeholder="Email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input placeholder={form.notify ? 'Mot de passe (vide = généré)' : 'Mot de passe (optionnel)'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={form.notify} onChange={e => setForm({ ...form, notify: e.target.checked })} />
              Notifier par email
            </label>
            <select value={form.copyFromUserId || ''} onChange={e => setForm({ ...form, copyFromUserId: e.target.value })} title="Reprend rôles, accès modules et BU du compte choisi">
              <option value="">Copier les accès de… (optionnel)</option>
              {users.filter(u => u.access_status !== 'pending').map(u => (
                <option key={u.id} value={u.id}>{u.prenom} {u.nom} — {u.email}</option>
              ))}
            </select>
            {profiles.length > 0 && (
              <select value={form.applyProfileId || ''} onChange={e => setForm({ ...form, applyProfileId: e.target.value })} title="Le profil sera appliqué juste après la création">
                <option value="">…ou appliquer un profil</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            )}
            <button type="submit" className="btn btn-primary">Créer</button>
          </form>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
            Si « Notifier par email » est coché, l'utilisateur reçoit ses identifiants et un lien de connexion. Laissez le mot de passe vide pour en générer un automatiquement.
          </p>
          {error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      )}

      {profiles.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <strong>Profils d'accès</strong>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Modèles réutilisables (rôles + accès modules + BU) — applicables à un utilisateur depuis sa fiche détail.
            </span>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {profiles.map(p => {
              const d = p.data || {};
              const summary = `${(d.roles || []).length} rôle(s) · ${(d.subModules || []).length} module(s) · ${(d.businessUnits || []).length} BU`;
              return (
                <span key={p.id} className="badge" style={{ background: 'var(--color-primary-bg, var(--color-border))', color: 'var(--color-text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title={`${p.description ? p.description + ' — ' : ''}${summary}`}>
                  <strong>{p.nom}</strong>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>({summary})</span>
                  <button onClick={() => deleteProfile(p.id, p.nom)} className="btn-icon" aria-label="Désactiver  le profil">×</button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {notice && (
        <div
          className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-warning'}`}
          style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="btn-icon" aria-label="Fermer">×</button>
        </div>
      )}
      {error && !showCreateForm && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="form-inline" style={{ marginBottom: 16 }}>
        <input
          placeholder="Rechercher (nom, prénom, email)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">Tous les rôles</option>
          {ROLE_CODES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {Object.entries(STATUS_META).map(([key, meta]) => {
            const count = users.filter(u => userStatus(u) === key).length;
            return (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="checkbox" checked={statusFilter[key]}
                  onChange={e => setStatusFilter(s => ({ ...s, [key]: e.target.checked }))} />
                <span className="badge" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>
                <span style={{ color: 'var(--color-text-faint)' }}>{count}</span>
              </label>
            );
          })}
        </div>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {filteredUsers.length} / {users.length} utilisateur{users.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Prénoms</th>
                <th>Rôle</th>
                <th>Profil</th>
                <th>Module</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map(u => (
                <UserRow key={u.id} u={u} roleSummary={roleSummary} moduleSummary={moduleSummary}
                  sendingId={sendingId} rejectPanel={rejectPanel} setRejectPanel={setRejectPanel}
                  toggleReject={toggleReject} approveAccess={approveAccess} rejectAccess={rejectAccess}
                  toggleActive={toggleActive} />
              ))}
              {filteredUsers.length === 0 && (
                <tr><td className="empty-row" colSpan={6}>Aucun utilisateur ne correspond à ce filtre.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredUsers.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <span>{filteredUsers.length} utilisateur{filteredUsers.length > 1 ? 's' : ''} au total</span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Précédent</button>
              <span>Page {page} / {totalPages}</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Suivant →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserRow({ u, roleSummary, moduleSummary, sendingId, rejectPanel, setRejectPanel, toggleReject, approveAccess, rejectAccess, toggleActive }) {
  const isPending = u.access_status === 'pending';
  return (
    <>
      <tr>
        <td>{u.nom}</td>
        <td>{u.prenom}</td>
        <td>{roleSummary(u)}</td>
        <td><StatusBadge status={userStatus(u)} /></td>
        <td>{moduleSummary(u)}</td>
        <td>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Link to={`/admin/users/${u.id}`} className="btn btn-secondary btn-sm">Détail</Link>
            {isPending ? (
              <>
                <button onClick={() => approveAccess(u)} disabled={sendingId === u.id} className="btn btn-primary btn-sm">
                  {sendingId === u.id ? '…' : 'Valider'}
                </button>
                <button onClick={() => toggleReject(u)} className="btn btn-danger-ghost btn-sm">
                  {rejectPanel[u.id] !== undefined ? 'Fermer' : 'Rejeter'}
                </button>
              </>
            ) : (
              <>
                <Link to={`/admin/users/${u.id}?edit=1`} className="btn btn-secondary btn-sm">Éditer</Link>
                <button onClick={() => toggleActive(u)} className={u.actif ? 'btn btn-danger-ghost btn-sm' : 'btn btn-secondary btn-sm'}>
                  {u.actif ? 'Désactiver ' : 'Réactiver'}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {rejectPanel[u.id] !== undefined && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--color-hover)' }}>
            <textarea placeholder="Motif du rejet (envoyé au demandeur par email)" value={rejectPanel[u.id]}
              onChange={e => setRejectPanel(p => ({ ...p, [u.id]: e.target.value }))}
              style={{ display: 'block', width: '100%', marginBottom: 8 }} />
            <button onClick={() => rejectAccess(u)} disabled={sendingId === u.id} className="btn btn-danger btn-sm">
              {sendingId === u.id ? 'Rejet…' : 'Confirmer le rejet'}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}
