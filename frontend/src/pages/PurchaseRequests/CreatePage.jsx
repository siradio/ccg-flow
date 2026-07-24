import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, isSuperAdmin } from '../../auth/AuthContext';

export default function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entities, setEntities] = useState([]);
  const [form, setForm] = useState({ entityId: '', objet: '', justification: '', devise: 'GNF' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const allowedEntityIds = useMemo(() => {
    if (isSuperAdmin(user)) return 'all';
    return [...new Set(user.roles.map(r => r.entity_id).filter(Boolean))];
  }, [user]);

  useEffect(() => {
    client.get('/entities').then(res => {
      const list = allowedEntityIds === 'all' ? res.data : res.data.filter(e => allowedEntityIds.includes(e.id));
      setEntities(list);
      if (list.length === 1) setForm(f => ({ ...f, entityId: list[0].id }));
    });
  }, [allowedEntityIds]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await client.post('/purchase-requests', { ...form, entityId: Number(form.entityId) });
      navigate(`/purchase-requests/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>Nouvelle demande d'achat</h1>
      <div className="card" style={{ maxWidth: 500 }}>
        <form onSubmit={onSubmit} className="form-grid" style={{ maxWidth: 'none' }}>
          <label className="field">
            Entité
            <select value={form.entityId} onChange={e => setForm({ ...form, entityId: e.target.value })} required>
              <option value="" disabled>Sélectionner…</option>
              {entities.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </label>
          <label className="field">
            Objet
            <input value={form.objet} onChange={e => setForm({ ...form, objet: e.target.value })} required />
          </label>
          <label className="field">
            Justification
            <textarea value={form.justification} onChange={e => setForm({ ...form, justification: e.target.value })} style={{ minHeight: 80 }} />
          </label>
          <label className="field">
            Devise
            <select value={form.devise} onChange={e => setForm({ ...form, devise: e.target.value })}>
              <option value="GNF">GNF</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          {error && <div className="alert alert-danger">{error}</div>}
          <button type="submit" disabled={saving} className="btn btn-primary" style={{ alignSelf: 'start' }}>
            {saving ? 'Création…' : 'Créer le brouillon'}
          </button>
        </form>
      </div>
    </div>
  );
}
