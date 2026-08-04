import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, isSuperAdmin } from '../../auth/AuthContext';
import WorkflowTimeline from '../../components/WorkflowTimeline';

// Statut fictif "rien n'a encore démarré" : sert uniquement à faire afficher WorkflowTimeline en
// mode aperçu (toutes les étapes "à venir") avant même qu'une demande existe.
const PREVIEW_PR = { status: 'brouillon', approvals: [] };

export default function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entities, setEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [steps, setSteps] = useState([]);
  const [form, setForm] = useState({ entityId: '', objet: '', justification: '', businessUnitId: '' });
  const [proforma, setProforma] = useState(null);
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

  useEffect(() => {
    client.get('/workflows/demande_achat').then(res => setSteps(res.data.steps));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
  }, []);

  // Les Business Units sont rattachées à SOGUIPAL : le choix de la BU ne s'affiche que pour elle.
  const selectedEntity = entities.find(e => String(e.id) === String(form.entityId));
  const isSoguipal = selectedEntity?.code === 'SOGUIPAL';

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        entityId: Number(form.entityId),
        objet: form.objet,
        justification: form.justification,
      };
      // BU informative, uniquement pour SOGUIPAL ; vide = « Toutes les BU ».
      if (isSoguipal && form.businessUnitId) payload.businessUnitId = Number(form.businessUnitId);
      const res = await client.post('/purchase-requests', payload);
      // Proforma déjà disponible : on le joint tout de suite à la demande créée.
      if (proforma) {
        const fd = new FormData();
        fd.append('file', proforma);
        await client.post(`/purchase-requests/${res.data.id}/attachments`, fd);
      }
      navigate(`/purchase-requests/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 4 }}>Nouvelle demande d'achat</h1>
      <p className="page-subtitle" style={{ marginBottom: 20, maxWidth: 500 }}>
        Une fois soumise, votre demande doit d'abord être validée comme{' '}
        <strong>expression de besoin</strong>, avant que le service achat ne consulte des
        fournisseurs. Le circuit complet :
      </p>

      {steps.length > 0 && (
        <div className="card" style={{ maxWidth: 500 }}>
          <WorkflowTimeline pr={PREVIEW_PR} steps={steps} />
        </div>
      )}

      <div className="card" style={{ maxWidth: 500 }}>
        <form onSubmit={onSubmit} className="form-grid" style={{ maxWidth: 'none' }}>
          <label className="field">
            Entité
            <select value={form.entityId} onChange={e => setForm({ ...form, entityId: e.target.value, businessUnitId: '' })} required>
              <option value="" disabled>Sélectionner…</option>
              {entities.map(e => <option key={e.id} value={e.id}>{e.code}</option>)}
            </select>
          </label>
          {isSoguipal && (
            <label className="field">
              Business Unit
              <select value={form.businessUnitId} onChange={e => setForm({ ...form, businessUnitId: e.target.value })}>
                <option value="">Toutes les BU</option>
                {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            Objet
            <input value={form.objet} onChange={e => setForm({ ...form, objet: e.target.value })} required />
          </label>
          <label className="field">
            Justification
            <textarea value={form.justification} onChange={e => setForm({ ...form, justification: e.target.value })} style={{ minHeight: 80 }} />
          </label>
          <label className="field">
            Proforma (optionnel)
            <input type="file" accept="application/pdf,image/*"
              onChange={e => setProforma(e.target.files[0] || null)} />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Si vous disposez déjà d'un proforma, joignez-le dès maintenant ; il sera visible sur la demande.
            </span>
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
