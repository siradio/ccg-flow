import { useCallback, useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import client from '../../../api/client';
import Modal from '../../../components/Modal.jsx';
import RhSubnav, { canManageRhTypes } from '../RhSubnav';
import { useAuth } from '../../../auth/AuthContext';
import { useConfirm } from '../../../components/ConfirmProvider.jsx';

// Lot 2 — Modèles de test (liste + éditeur). Le détail d'un modèle (variantes + questions) est sur
// RecrutementTemplateDetail (/rh/recrutement/modeles/:id).

const STATUTS = { brouillon: 'Brouillon', publie: 'Publié', archive: 'Archivé' };
const MODES = [{ v: 'auto', l: 'Automatique (QCM/exact)' }, { v: 'mixte', l: 'Mixte (auto + manuel)' }, { v: 'manuel', l: 'Manuel' }];

const EMPTY = {
  titre: '', description: '', poste: '', entity_id: '', departement: '', consignes: '',
  duree_min: 40, seuil_reussite: '', tentatives_autorisees: 1, mode_correction: 'auto',
  afficher_resultat_candidat: false, melange_questions: false, melange_reponses: false,
};

export default function RecrutementTemplates() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setRows((await client.get('/rh/recrutement/templates')).data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'Erreur de chargement.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { client.get('/entities').then(r => setEntities(r.data)).catch(() => {}); }, []);

  if (!canManageRhTypes(user)) return <Navigate to="/rh/mes-demandes" replace />;

  async function setStatut(id, statut) {
    try { await client.post(`/rh/recrutement/templates/${id}/statut`, { statut }); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function duplicate(id) {
    try { await client.post(`/rh/recrutement/templates/${id}/duplicate`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function remove(id) {
    if (!(await confirm('Supprimer ce modèle et ses variantes ?', { danger: true, confirmLabel: 'Supprimer' }))) return;
    try { await client.delete(`/rh/recrutement/templates/${id}`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }

  return (
    <div>
      <RhSubnav />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Modèles de test</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>+ Nouveau modèle</button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Titre</th><th>Poste</th><th style={{ textAlign: 'center' }}>Durée</th><th style={{ textAlign: 'center' }}>Variantes</th><th style={{ textAlign: 'center' }}>Statut</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 18 }}>Aucun modèle.</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td><Link to={`/rh/recrutement/modeles/${r.id}`}>{r.titre}</Link></td>
                <td>{r.poste || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.duree_min} min</td>
                <td style={{ textAlign: 'center' }}>{r.nb_variantes || '—'}</td>
                <td style={{ textAlign: 'center' }}><span className="badge">{STATUTS[r.statut] || r.statut}</span></td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <Link className="btn btn-secondary btn-sm" to={`/rh/recrutement/modeles/${r.id}`}>Ouvrir</Link>{' '}
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ ...EMPTY, ...r, entity_id: r.entity_id || '', seuil_reussite: r.seuil_reussite ?? '' })}>Éditer</button>{' '}
                  {r.statut !== 'publie' && <button className="btn btn-secondary btn-sm" onClick={() => setStatut(r.id, 'publie')}>Publier</button>}
                  {r.statut === 'publie' && <button className="btn btn-secondary btn-sm" onClick={() => setStatut(r.id, 'archive')}>Archiver</button>}{' '}
                  <button className="btn btn-secondary btn-sm" onClick={() => duplicate(r.id)}>Dupliquer</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <TemplateEditor initial={editing} entities={entities} onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }} />
      )}
    </div>
  );
}

function TemplateEditor({ initial, entities, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    if (!f.titre.trim()) { setErr('Le titre est obligatoire.'); return; }
    setSaving(true); setErr('');
    const payload = { ...f, entity_id: f.entity_id || null, seuil_reussite: f.seuil_reussite === '' ? null : Number(f.seuil_reussite) };
    try {
      if (f.id) await client.put(`/rh/recrutement/templates/${f.id}`, payload);
      else await client.post('/rh/recrutement/templates', payload);
      await onSaved();
    } catch (e) { setErr(e.response?.data?.error || 'Erreur.'); setSaving(false); }
  }

  return (
    <Modal title={f.id ? 'Modifier le modèle' : 'Nouveau modèle'} onClose={onClose} wide>
      {err && <div className="alert alert-danger">{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">Titre
          <input value={f.titre} onChange={e => set('titre', e.target.value)} required />
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 200 }}>Poste concerné
            <input value={f.poste} onChange={e => set('poste', e.target.value)} />
          </label>
          <label className="field" style={{ minWidth: 160 }}>Société
            <select value={f.entity_id} onChange={e => set('entity_id', e.target.value)}>
              <option value="">Groupe (toutes)</option>
              {entities.map(en => <option key={en.id} value={en.id}>{en.nom}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 150 }}>Service / département
            <input value={f.departement} onChange={e => set('departement', e.target.value)} />
          </label>
        </div>
        <label className="field">Description
          <textarea value={f.description} onChange={e => set('description', e.target.value)} style={{ minHeight: 44 }} />
        </label>
        <label className="field">Consignes au candidat
          <textarea value={f.consignes} onChange={e => set('consignes', e.target.value)} style={{ minHeight: 60 }} />
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ width: 130 }}>Durée (min)
            <input type="number" min="1" value={f.duree_min} onChange={e => set('duree_min', e.target.value)} />
          </label>
          <label className="field" style={{ width: 150 }}>Seuil de réussite (%)
            <input type="number" min="0" max="100" value={f.seuil_reussite} onChange={e => set('seuil_reussite', e.target.value)} placeholder="indicatif" />
          </label>
          <label className="field" style={{ width: 150 }}>Tentatives autorisées
            <input type="number" min="1" value={f.tentatives_autorisees} onChange={e => set('tentatives_autorisees', e.target.value)} />
          </label>
          <label className="field" style={{ minWidth: 190 }}>Mode de correction
            <select value={f.mode_correction} onChange={e => set('mode_correction', e.target.value)}>
              {MODES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!f.melange_questions} onChange={e => set('melange_questions', e.target.checked)} /> Mélanger l'ordre des questions</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!f.melange_reponses} onChange={e => set('melange_reponses', e.target.checked)} /> Mélanger les propositions</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!f.afficher_resultat_candidat} onChange={e => set('afficher_resultat_candidat', e.target.checked)} /> Montrer le résultat au candidat</label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </Modal>
  );
}
