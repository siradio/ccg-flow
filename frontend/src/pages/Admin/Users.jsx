import { useEffect, useState } from 'react';
import client from '../../api/client';

const ROLE_CODES = ['super_admin', 'demandeur', 'service_achat', 'controle_gestion', 'finances', 'dga'];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [entities, setEntities] = useState([]);
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', password: '' });
  const [roleForm, setRoleForm] = useState({});
  const [error, setError] = useState('');

  function load() { client.get('/users').then(res => setUsers(res.data)); }
  useEffect(() => { load(); client.get('/entities').then(res => setEntities(res.data)); }, []);

  async function createUser(e) {
    e.preventDefault();
    setError('');
    try {
      await client.post('/users', form);
      setForm({ nom: '', prenom: '', email: '', password: '' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Erreur.'); }
  }

  async function addRole(userId) {
    const rf = roleForm[userId] || {};
    if (!rf.role_code) return;
    await client.post(`/users/${userId}/roles`, { entity_id: rf.role_code === 'super_admin' ? null : Number(rf.entity_id), role_code: rf.role_code });
    setRoleForm({ ...roleForm, [userId]: {} });
    load();
  }

  async function removeRole(userId, roleId) {
    await client.delete(`/users/${userId}/roles/${roleId}`);
    load();
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>Utilisateurs</h1>

      {users.map(u => (
        <div key={u.id} className="card">
          <strong>{u.prenom} {u.nom}</strong>
          <span style={{ color: 'var(--color-text-muted)' }}> — {u.email}</span>
          {!u.actif && <em style={{ color: 'var(--color-text-muted)' }}> (désactivé)</em>}
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
            {roleForm[u.id]?.role_code && roleForm[u.id]?.role_code !== 'super_admin' && (
              <select value={roleForm[u.id]?.entity_id || ''} onChange={e => setRoleForm({ ...roleForm, [u.id]: { ...roleForm[u.id], entity_id: e.target.value } })}>
                <option value="">Entité…</option>
                {entities.map(en => <option key={en.id} value={en.id}>{en.nom}</option>)}
              </select>
            )}
            <button onClick={() => addRole(u.id)} className="btn btn-primary btn-sm">+ Ajouter le rôle</button>
          </div>
        </div>
      ))}

      <div className="card" style={{ marginTop: 24 }}>
        <h2>Nouvel utilisateur</h2>
        <form onSubmit={createUser} className="form-inline">
          <input placeholder="Nom" required value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
          <input placeholder="Prénom" required value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
          <input placeholder="Email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Mot de passe (optionnel)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          <button type="submit" className="btn btn-primary">Créer</button>
        </form>
        {error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}
