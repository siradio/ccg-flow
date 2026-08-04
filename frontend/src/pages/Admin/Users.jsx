import { useEffect, useState } from 'react';
import client from '../../api/client';

const ROLE_CODES = ['super_admin', 'support_it', 'demandeur', 'service_achat', 'controle_gestion', 'finances', 'validateur_besoin'];
// Rôles globaux, non rattachés à une entité (comme super_admin) — voir users.routes.js.
const GLOBAL_ROLES = ['super_admin', 'support_it'];
const NIVEAUX = [
  { value: '', label: '— (aucun accès)' },
  { value: 'consultation', label: 'Consultation (lecture seule)' },
  { value: 'ajout', label: 'Ajout (peut créer)' },
  { value: 'edition', label: 'Édition (peut aussi modifier/supprimer)' },
];

// Statut consolidé d'un compte : la demande d'accès (pending/rejected) prime sur l'actif/inactif.
function userStatus(u) {
  if (u.access_status === 'pending') return 'pending';
  if (u.access_status === 'rejected') return 'rejected';
  return u.actif ? 'active' : 'inactive';
}
const STATUS_META = {
  active: { label: 'Actif', bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  inactive: { label: 'Désactivé', bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
  pending: { label: 'À valider', bg: 'var(--status-amber-bg)', fg: 'var(--status-amber-fg)' },
  rejected: { label: 'Rejeté', bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [entities, setEntities] = useState([]);
  const [moduleCatalog, setModuleCatalog] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', password: '', notify: true });
  const [notice, setNotice] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [pwPanel, setPwPanel] = useState({}); // { [userId]: { password, notify } } — panneau "Mot de passe" ouvert
  const [roleForm, setRoleForm] = useState({});
  const [buForm, setBuForm] = useState({});
  const [error, setError] = useState('');
  // Chaque carte utilisateur est longue (rôles + grille module/sous-module + BU) — sans filtre,
  // retrouver un utilisateur précis dans une longue liste veut dire défiler devant tous les autres.
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState({ active: true, inactive: true, pending: true, rejected: true });
  const [editPanel, setEditPanel] = useState({});     // { [userId]: { nom, prenom, email, telephone, fonction } }
  const [rejectPanel, setRejectPanel] = useState({}); // { [userId]: note } — panneau de rejet ouvert

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search || `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(search.toLowerCase());
    const matchesRole = !roleFilter || u.roles.some(r => r.role_code === roleFilter);
    const matchesStatus = statusFilter[userStatus(u)];
    return matchesSearch && matchesRole && matchesStatus;
  });

  function load() { client.get('/users').then(res => setUsers(res.data)); }
  useEffect(() => {
    load();
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/users/sub-module-catalog').then(res => setModuleCatalog(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setError('');
    setNotice(null);
    try {
      const { data } = await client.post('/users', form);
      const who = `${form.prenom} ${form.nom} (${form.email})`;
      if (form.notify && data.notification?.sent) {
        setNotice({ type: 'success', text: `Utilisateur créé. Identifiants envoyés par email à ${form.email}.` });
      } else if (form.notify && !data.notification?.sent) {
        const pw = data.generatedPassword ? ` Mot de passe généré : ${data.generatedPassword} — à communiquer manuellement.` : ' Communiquez-lui manuellement le mot de passe saisi.';
        setNotice({ type: 'warning', text: `Utilisateur créé, mais l'email n'a pas pu être envoyé${data.notification?.error ? ` (${data.notification.error})` : ''}.${pw}` });
      } else {
        setNotice({ type: 'success', text: `Utilisateur ${who} créé.` });
      }
      setForm({ nom: '', prenom: '', email: '', password: '', notify: true });
      setShowCreateForm(false);
      load();
    } catch (err) { setError(err.response?.data?.error || 'Erreur.'); }
  }

  async function addRole(userId) {
    const rf = roleForm[userId] || {};
    if (!rf.role_code) return;
    await client.post(`/users/${userId}/roles`, { entity_id: GLOBAL_ROLES.includes(rf.role_code) ? null : Number(rf.entity_id), role_code: rf.role_code });
    setRoleForm({ ...roleForm, [userId]: {} });
    load();
  }

  async function removeRole(userId, roleId) {
    await client.delete(`/users/${userId}/roles/${roleId}`);
    load();
  }

  // Une seule action pour tout le nouveau système : niveau vide = révoque, sinon octroie/met à
  // jour (§2.3 SPEC.md) — remplace les anciens addModule/removeModule/setPrixNiveau séparés.
  async function setSubModuleNiveau(userId, subModuleKey, niveau) {
    if (niveau) await client.put(`/users/${userId}/sub-modules/${subModuleKey}`, { niveau });
    else await client.delete(`/users/${userId}/sub-modules/${subModuleKey}`);
    load();
  }

  async function addBusinessUnit(userId) {
    const businessUnitId = buForm[userId];
    if (!businessUnitId) return;
    await client.post(`/users/${userId}/business-units`, { business_unit_id: Number(businessUnitId) });
    setBuForm({ ...buForm, [userId]: '' });
    load();
  }

  async function removeBusinessUnit(userId, accessId) {
    await client.delete(`/users/${userId}/business-units/${accessId}`);
    load();
  }

  async function toggleActive(u) {
    const action = u.actif ? 'désactiver' : 'réactiver';
    if (!window.confirm(`Confirmer : ${action} ${u.prenom} ${u.nom} ?`)) return;
    setError('');
    setNotice(null);
    try {
      await client.put(`/users/${u.id}`, { actif: !u.actif });
      setNotice({ type: 'success', text: `${u.prenom} ${u.nom} ${u.actif ? 'désactivé' : 'réactivé'}.` });
      load();
    } catch (err) {
      // Ne plus échouer en silence : un compte sans droits d'administration recevait un 403 sans
      // aucun retour visible, donnant l'impression que « le bouton ne marche pas ».
      setError(err.response?.data?.error || `Impossible de ${action} cet utilisateur.`);
    }
  }

  // --- Demandes d'accès (statut "à valider") -------------------------------------------------
  async function approveAccess(u) {
    if (!window.confirm(`Valider l'accès de ${u.prenom} ${u.nom} ? Un mot de passe lui sera généré et envoyé par email à ${u.email}.`)) return;
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

  // --- Édition des informations d'un compte (compléter nom/tél/fonction...) ------------------
  function toggleEdit(u) {
    setEditPanel(p => (p[u.id] ? (() => { const n = { ...p }; delete n[u.id]; return n; })()
      : { ...p, [u.id]: { nom: u.nom, prenom: u.prenom, email: u.email, telephone: u.telephone || '', fonction: u.fonction || '' } }));
  }
  async function saveEdit(u) {
    const f = editPanel[u.id];
    if (!f) return;
    setError(''); setNotice(null); setSendingId(u.id);
    try {
      await client.put(`/users/${u.id}`, f);
      setEditPanel(p => { const n = { ...p }; delete n[u.id]; return n; });
      setNotice({ type: 'success', text: 'Informations mises à jour.' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Échec de la mise à jour.'); }
    finally { setSendingId(null); }
  }

  function togglePwPanel(u) {
    setPwPanel(p => {
      if (p[u.id]) { const n = { ...p }; delete n[u.id]; return n; }
      return { ...p, [u.id]: { password: '', notify: true } };
    });
  }

  // Définit le mot de passe d'un utilisateur existant : celui saisi par l'admin, ou un mot de passe
  // fort généré si le champ est laissé vide. L'ancien mot de passe est toujours remplacé (les mots
  // de passe sont hachés, on ne peut pas renvoyer l'ancien) — le champ visible rend l'action
  // volontaire, plus de réinitialisation surprise.
  async function applyPassword(u) {
    const st = pwPanel[u.id];
    if (!st) return;
    setError('');
    setNotice(null);
    setSendingId(u.id);
    try {
      const { data } = await client.post(`/users/${u.id}/set-password`, { password: st.password, notify: st.notify });
      const gen = data.generatedPassword;
      if (st.notify && data.notification?.sent) {
        setNotice({ type: 'success', text: `Mot de passe mis à jour et envoyé par email à ${u.email}.` });
      } else if (st.notify && !data.notification?.sent) {
        setNotice({ type: 'warning', text: `Mot de passe mis à jour, mais l'email n'a pas pu être envoyé${data.notification?.error ? ` (${data.notification.error})` : ''}.${gen ? ` Mot de passe généré : ${gen} — à communiquer manuellement.` : ''}` });
      } else {
        setNotice({ type: 'success', text: `Mot de passe mis à jour pour ${u.email}.${gen ? ` Mot de passe généré : ${gen} — à lui communiquer.` : ''}` });
      }
      setPwPanel(p => { const n = { ...p }; delete n[u.id]; return n; });
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la mise à jour du mot de passe.');
    } finally {
      setSendingId(null);
    }
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
            <button type="submit" className="btn btn-primary">Créer</button>
          </form>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
            Si « Notifier par email » est coché, l'utilisateur reçoit ses identifiants et un lien de connexion. Laissez le mot de passe vide pour en générer un automatiquement.
          </p>
          {error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}
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

      {filteredUsers.length === 0 && <p className="empty-row">Aucun utilisateur ne correspond à ce filtre.</p>}

      {filteredUsers.map(u => (
        <div key={u.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div>
                <strong>{u.prenom} {u.nom}</strong>
                <span style={{ color: 'var(--color-text-muted)' }}> — {u.email}</span>
                {' '}
                <span className="badge" style={{ background: STATUS_META[userStatus(u)].bg, color: STATUS_META[userStatus(u)].fg }}>
                  {STATUS_META[userStatus(u)].label}
                </span>
              </div>
              {(u.fonction || u.telephone) && (
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3 }}>
                  {[u.fonction, u.telephone].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              {u.access_status === 'pending' ? (
                <>
                  <button onClick={() => approveAccess(u)} disabled={sendingId === u.id} className="btn btn-primary btn-sm">
                    {sendingId === u.id ? '…' : 'Valider l’accès'}
                  </button>
                  <button onClick={() => toggleReject(u)} className="btn btn-danger-ghost btn-sm">
                    {rejectPanel[u.id] !== undefined ? 'Fermer' : 'Rejeter'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => togglePwPanel(u)} className="btn btn-secondary btn-sm" title="Définir / réinitialiser le mot de passe et l’envoyer par email">
                    {pwPanel[u.id] ? 'Fermer' : 'Mot de passe'}
                  </button>
                  <button onClick={() => toggleActive(u)} className={u.actif ? 'btn btn-danger-ghost btn-sm' : 'btn btn-secondary btn-sm'}>
                    {u.actif ? 'Désactiver' : 'Réactiver'}
                  </button>
                </>
              )}
              <button onClick={() => toggleEdit(u)} className="btn btn-secondary btn-sm">
                {editPanel[u.id] ? 'Fermer' : 'Éditer'}
              </button>
            </div>
          </div>

          {rejectPanel[u.id] !== undefined && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
              <textarea placeholder="Motif du rejet (envoyé au demandeur par email)" value={rejectPanel[u.id]}
                onChange={e => setRejectPanel(p => ({ ...p, [u.id]: e.target.value }))}
                style={{ display: 'block', width: '100%', marginBottom: 8 }} />
              <button onClick={() => rejectAccess(u)} disabled={sendingId === u.id} className="btn btn-danger btn-sm">
                {sendingId === u.id ? 'Rejet…' : 'Confirmer le rejet'}
              </button>
            </div>
          )}

          {editPanel[u.id] && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
              <div className="form-inline" style={{ flexWrap: 'wrap' }}>
                <input placeholder="Prénom" value={editPanel[u.id].prenom} onChange={e => setEditPanel(p => ({ ...p, [u.id]: { ...p[u.id], prenom: e.target.value } }))} />
                <input placeholder="Nom" value={editPanel[u.id].nom} onChange={e => setEditPanel(p => ({ ...p, [u.id]: { ...p[u.id], nom: e.target.value } }))} />
                <input placeholder="Email" type="email" value={editPanel[u.id].email} onChange={e => setEditPanel(p => ({ ...p, [u.id]: { ...p[u.id], email: e.target.value } }))} />
                <input placeholder="Téléphone" value={editPanel[u.id].telephone} onChange={e => setEditPanel(p => ({ ...p, [u.id]: { ...p[u.id], telephone: e.target.value } }))} />
                <input placeholder="Fonction" value={editPanel[u.id].fonction} onChange={e => setEditPanel(p => ({ ...p, [u.id]: { ...p[u.id], fonction: e.target.value } }))} />
                <button onClick={() => saveEdit(u)} disabled={sendingId === u.id} className="btn btn-primary btn-sm">Enregistrer</button>
              </div>
            </div>
          )}

          {pwPanel[u.id] && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
              <div className="form-inline" style={{ flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Nouveau mot de passe (vide = généré)"
                  value={pwPanel[u.id].password}
                  onChange={e => setPwPanel(p => ({ ...p, [u.id]: { ...p[u.id], password: e.target.value } }))}
                  style={{ minWidth: 260 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={pwPanel[u.id].notify}
                    onChange={e => setPwPanel(p => ({ ...p, [u.id]: { ...p[u.id], notify: e.target.checked } }))}
                  />
                  Envoyer par email
                </label>
                <button onClick={() => applyPassword(u)} disabled={sendingId === u.id} className="btn btn-primary btn-sm">
                  {sendingId === u.id ? 'Application…' : 'Appliquer'}
                </button>
              </div>
              <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
                Définit un nouveau mot de passe pour {u.prenom} {u.nom} (l’actuel sera remplacé). Laissez le champ vide pour en générer un automatiquement. Décochez « Envoyer par email » pour le communiquer vous-même.
              </p>
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Rôles workflow achat</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {u.roles.map(r => (
              <span key={r.id} className="badge" style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>
                {r.role_code}{r.entity_code ? ` (${r.entity_code})` : ''}
                {' '}<button onClick={() => removeRole(u.id, r.id)} className="btn-icon">×</button>
              </span>
            ))}
            {u.roles.length === 0 && <span className="empty-row">Aucun rôle.</span>}
          </div>
          <div className="form-inline" style={{ marginTop: 10 }}>
            <select value={roleForm[u.id]?.role_code || ''} onChange={e => setRoleForm({ ...roleForm, [u.id]: { ...roleForm[u.id], role_code: e.target.value } })}>
              <option value="">Rôle…</option>
              {ROLE_CODES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {roleForm[u.id]?.role_code && !GLOBAL_ROLES.includes(roleForm[u.id]?.role_code) && (
              <select value={roleForm[u.id]?.entity_id || ''} onChange={e => setRoleForm({ ...roleForm, [u.id]: { ...roleForm[u.id], entity_id: e.target.value } })}>
                <option value="">Entité…</option>
                {entities.map(en => <option key={en.id} value={en.id}>{en.nom}</option>)}
              </select>
            )}
            <button onClick={() => addRole(u.id)} className="btn btn-primary btn-sm">+ Ajouter le rôle</button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Accès aux modules
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {moduleCatalog.map(mod => (
              <ModuleAccessGroup key={mod.key} mod={mod} user={u} onChange={(key, niveau) => setSubModuleNiveau(u.id, key, niveau)} />
            ))}
          </div>

          <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Accès Business Units (Stock du Jour / Mouvement Stock)</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {u.businessUnits.map(b => (
              <span key={b.id} className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-fg)' }}>
                {b.business_unit_nom}
                {' '}<button onClick={() => removeBusinessUnit(u.id, b.id)} className="btn-icon">×</button>
              </span>
            ))}
            {u.businessUnits.length === 0 && <span className="empty-row">Aucune BU accordée (lecture seule sur toutes si un sous-module Stock est accordé).</span>}
          </div>
          <div className="form-inline" style={{ marginTop: 10 }}>
            <select value={buForm[u.id] || ''} onChange={e => setBuForm({ ...buForm, [u.id]: e.target.value })}>
              <option value="">Business Unit…</option>
              {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
            <button onClick={() => addBusinessUnit(u.id)} className="btn btn-primary btn-sm">+ Accorder la BU</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Un module = un bloc ; ses sous-modules (ou lui-même s'il n'en a pas — voir modules.js §2.3)
// sont chacun une ligne avec leur propre sélecteur de niveau. Remplace le menu déroulant plat
// unique d'avant, qui devenait ingérable à mesure que le nombre de modules augmentait.
function ModuleAccessGroup({ mod, user, onChange }) {
  const rows = mod.subModules.length ? mod.subModules : [{ key: mod.key, label: mod.label }];
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: rows.length > 1 || rows[0].key !== mod.key ? 6 : 0 }}>
        {mod.label}
      </div>
      {rows.map(row => {
        const current = user.subModules.find(s => s.sub_module_key === row.key)?.niveau || '';
        return (
          <div key={row.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '3px 0', paddingLeft: mod.subModules.length ? 12 : 0 }}>
            <span style={{ fontSize: 13, color: mod.subModules.length ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
              {mod.subModules.length ? row.label : null}
            </span>
            <select value={current} onChange={e => onChange(row.key, e.target.value)} style={{ fontSize: 12 }}>
              {NIVEAUX.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}
