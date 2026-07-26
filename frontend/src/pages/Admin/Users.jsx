import { useEffect, useState } from 'react';
import client from '../../api/client';

const ROLE_CODES = ['super_admin', 'demandeur', 'service_achat', 'controle_gestion', 'finances', 'dga'];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [entities, setEntities] = useState([]);
  const [moduleCatalog, setModuleCatalog] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', password: '' });
  const [roleForm, setRoleForm] = useState({});
  const [moduleForm, setModuleForm] = useState({});
  const [buForm, setBuForm] = useState({});
  const [error, setError] = useState('');

  function load() { client.get('/users').then(res => setUsers(res.data)); }
  useEffect(() => {
    load();
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/users/module-catalog').then(res => setModuleCatalog(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
  }, []);

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

  async function addModule(userId) {
    const moduleKey = moduleForm[userId];
    if (!moduleKey) return;
    await client.post(`/users/${userId}/modules`, { module_key: moduleKey });
    setModuleForm({ ...moduleForm, [userId]: '' });
    load();
  }

  async function removeModule(userId, accessId) {
    await client.delete(`/users/${userId}/modules/${accessId}`);
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

  async function setPrixNiveau(userId, niveau) {
    await client.put(`/users/${userId}/prix-niveau`, { niveau });
    load();
  }

  function moduleLabel(key) {
    return moduleCatalog.find(m => m.key === key)?.label || key;
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>Utilisateurs</h1>

      {users.map(u => (
        <div key={u.id} className="card">
          <strong>{u.prenom} {u.nom}</strong>
          <span style={{ color: 'var(--color-text-muted)' }}> — {u.email}</span>
          {!u.actif && <em style={{ color: 'var(--color-text-muted)' }}> (désactivé)</em>}

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
            {roleForm[u.id]?.role_code && roleForm[u.id]?.role_code !== 'super_admin' && (
              <select value={roleForm[u.id]?.entity_id || ''} onChange={e => setRoleForm({ ...roleForm, [u.id]: { ...roleForm[u.id], entity_id: e.target.value } })}>
                <option value="">Entité…</option>
                {entities.map(en => <option key={en.id} value={en.id}>{en.nom}</option>)}
              </select>
            )}
            <button onClick={() => addRole(u.id)} className="btn btn-primary btn-sm">+ Ajouter le rôle</button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Accès aux modules</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {u.modules.map(m => (
              <span key={m.id} className="badge" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
                {moduleLabel(m.module_key)}
                {' '}<button onClick={() => removeModule(u.id, m.id)} className="btn-icon">×</button>
              </span>
            ))}
            {u.modules.length === 0 && <span className="empty-row">Aucun module accordé (super_admin a accès à tout par défaut).</span>}
          </div>
          <div className="form-inline" style={{ marginTop: 10 }}>
            <select value={moduleForm[u.id] || ''} onChange={e => setModuleForm({ ...moduleForm, [u.id]: e.target.value })}>
              <option value="">Module…</option>
              {moduleCatalog.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <button onClick={() => addModule(u.id)} className="btn btn-primary btn-sm">+ Accorder le module</button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Accès Business Units (Stock du Jour)</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {u.businessUnits.map(b => (
              <span key={b.id} className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-fg)' }}>
                {b.business_unit_nom}
                {' '}<button onClick={() => removeBusinessUnit(u.id, b.id)} className="btn-icon">×</button>
              </span>
            ))}
            {u.businessUnits.length === 0 && <span className="empty-row">Aucune BU accordée (lecture seule sur toutes si le module Stock est accordé).</span>}
          </div>
          <div className="form-inline" style={{ marginTop: 10 }}>
            <select value={buForm[u.id] || ''} onChange={e => setBuForm({ ...buForm, [u.id]: e.target.value })}>
              <option value="">Business Unit…</option>
              {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
            <button onClick={() => addBusinessUnit(u.id)} className="btn btn-primary btn-sm">+ Accorder la BU</button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Niveau d'accès Prix</div>
          <div className="form-inline" style={{ marginTop: 6 }}>
            <select value={u.prixNiveau || 'consultation'} onChange={e => setPrixNiveau(u.id, e.target.value)}>
              <option value="consultation">Consultation (lecture seule)</option>
              <option value="ajout">Ajout (peut enregistrer un nouveau prix)</option>
              <option value="edition">Édition (peut aussi corriger/supprimer)</option>
            </select>
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
