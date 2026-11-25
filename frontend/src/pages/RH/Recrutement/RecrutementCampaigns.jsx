import { useCallback, useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import client from '../../../api/client';
import Modal from '../../../components/Modal.jsx';
import RhSubnav, { canManageRhTypes } from '../RhSubnav';
import { useAuth } from '../../../auth/AuthContext';
import { useConfirm } from '../../../components/ConfirmProvider.jsx';

const STATUTS = { brouillon: 'Brouillon', active: 'Active', suspendue: 'Suspendue', cloturee: 'Clôturée', archivee: 'Archivée' };
const CONTRATS = ['Stage', 'CDD', 'CDI', 'Intérim', 'Consultant', 'Autre'];

const EMPTY = {
  intitule: '', description: '', entity_id: '', departement: '', poste: '', type_contrat: '', nb_postes: '',
  date_debut: '', date_fin: '', responsable_rh_user_id: '', responsable_service_user_id: '', template_id: '',
};

export default function RecrutementCampaigns() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setRows((await client.get('/rh/recrutement/campaigns')).data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    client.get('/entities').then(r => setEntities(r.data)).catch(() => {});
    client.get('/rh/recrutement/templates', { params: { statut: 'publie' } }).then(r => setTemplates(r.data)).catch(() => {});
    client.get('/rh/recrutement/assignable-users').then(r => setUsers(r.data)).catch(() => {});
  }, []);

  if (!canManageRhTypes(user)) return <Navigate to="/rh/mes-demandes" replace />;

  async function setStatut(id, statut) {
    try { await client.post(`/rh/recrutement/campaigns/${id}/statut`, { statut }); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function remove(id) {
    if (!(await confirm('Supprimer cette campagne, ses candidats et leurs accès ?', { danger: true, confirmLabel: 'Supprimer' }))) return;
    try { await client.delete(`/rh/recrutement/campaigns/${id}`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }

  return (
    <div>
      <RhSubnav />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Campagnes de recrutement</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>+ Nouvelle campagne</button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Campagne</th><th>Poste</th><th>Société</th><th>Modèle</th><th style={{ textAlign: 'center' }}>Candidats</th><th style={{ textAlign: 'center' }}>Statut</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 18 }}>Aucune campagne.</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td><Link to={`/rh/recrutement/campagnes/${r.id}`}>{r.intitule}</Link>{r.code && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.code}</div>}</td>
                <td>{r.poste || '—'}</td>
                <td>{r.entity_nom || '—'}</td>
                <td>{r.template_titre || <span style={{ color: 'var(--color-danger, #b42318)' }}>aucun</span>}</td>
                <td style={{ textAlign: 'center' }}>{r.nb_candidats || '—'}</td>
                <td style={{ textAlign: 'center' }}><span className="badge">{STATUTS[r.statut] || r.statut}</span></td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <Link className="btn btn-secondary btn-sm" to={`/rh/recrutement/campagnes/${r.id}`}>Ouvrir</Link>{' '}
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ ...EMPTY, ...r, entity_id: r.entity_id || '', template_id: r.template_id || '', responsable_rh_user_id: r.responsable_rh_user_id || '', responsable_service_user_id: r.responsable_service_user_id || '', nb_postes: r.nb_postes ?? '', date_debut: r.date_debut ? r.date_debut.slice(0, 10) : '', date_fin: r.date_fin ? r.date_fin.slice(0, 10) : '' })}>Éditer</button>{' '}
                  {r.statut !== 'active' && <button className="btn btn-secondary btn-sm" onClick={() => setStatut(r.id, 'active')}>Activer</button>}
                  {r.statut === 'active' && <button className="btn btn-secondary btn-sm" onClick={() => setStatut(r.id, 'cloturee')}>Clôturer</button>}{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <CampaignEditor initial={editing} entities={entities} templates={templates} users={users}
        onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
    </div>
  );
}

function CampaignEditor({ initial, entities, templates, users, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const userLabel = (u) => `${u.prenom} ${u.nom}`;

  async function save() {
    if (!f.intitule.trim()) { setErr("L'intitulé est obligatoire."); return; }
    setSaving(true); setErr('');
    const payload = { ...f };
    ['entity_id', 'template_id', 'responsable_rh_user_id', 'responsable_service_user_id', 'nb_postes'].forEach(k => { payload[k] = f[k] === '' ? null : f[k]; });
    try {
      if (f.id) await client.put(`/rh/recrutement/campaigns/${f.id}`, payload);
      else await client.post('/rh/recrutement/campaigns', payload);
      await onSaved();
    } catch (e) { setErr(e.response?.data?.error || 'Erreur.'); setSaving(false); }
  }

  return (
    <Modal title={f.id ? 'Modifier la campagne' : 'Nouvelle campagne'} onClose={onClose} wide>
      {err && <div className="alert alert-danger">{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">Intitulé
          <input value={f.intitule} onChange={e => set('intitule', e.target.value)} required />
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 200 }}>Poste recherché
            <input value={f.poste} onChange={e => set('poste', e.target.value)} />
          </label>
          <label className="field" style={{ minWidth: 150 }}>Société
            <select value={f.entity_id} onChange={e => set('entity_id', e.target.value)}>
              <option value="">—</option>
              {entities.map(en => <option key={en.id} value={en.id}>{en.nom}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 150 }}>Service / département
            <input value={f.departement} onChange={e => set('departement', e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ width: 150 }}>Type de contrat
            <select value={f.type_contrat} onChange={e => set('type_contrat', e.target.value)}>
              <option value="">—</option>
              {CONTRATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{ width: 110 }}>Nb de postes
            <input type="number" min="1" value={f.nb_postes} onChange={e => set('nb_postes', e.target.value)} />
          </label>
          <label className="field" style={{ width: 150 }}>Date de début
            <input type="date" value={f.date_debut} onChange={e => set('date_debut', e.target.value)} />
          </label>
          <label className="field" style={{ width: 150 }}>Date de fin
            <input type="date" value={f.date_fin} onChange={e => set('date_fin', e.target.value)} />
          </label>
        </div>
        <label className="field">Modèle de test (publié)
          <select value={f.template_id} onChange={e => set('template_id', e.target.value)}>
            <option value="">— à définir —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.titre}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 220 }}>Responsable RH
            <select value={f.responsable_rh_user_id} onChange={e => set('responsable_rh_user_id', e.target.value)}>
              <option value="">—</option>
              {users.map(u => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 220 }}>Responsable de service (notifié)
            <select value={f.responsable_service_user_id} onChange={e => set('responsable_service_user_id', e.target.value)}>
              <option value="">—</option>
              {users.map(u => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
            </select>
          </label>
        </div>
        <label className="field">Description
          <textarea value={f.description} onChange={e => set('description', e.target.value)} style={{ minHeight: 44 }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </Modal>
  );
}
