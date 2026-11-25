import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../../../api/client';
import Modal from '../../../components/Modal.jsx';
import RhSubnav, { canManageRhTypes } from '../RhSubnav';
import { useAuth } from '../../../auth/AuthContext';
import { useConfirm } from '../../../components/ConfirmProvider.jsx';
import { exportXlsx } from '../../../utils/exportData.jsx';

// Lot 1 — Banque de questions des tests de recrutement. Écran d'administration RH : liste filtrable
// + éditeur couvrant tous les types de question. Le corrigé et les bonnes réponses ne sortent que sur
// cet écran RH (la correction et le portail candidat, lots suivants, ne les exposent jamais).

const TYPES = [
  { v: 'qcm_unique', l: 'QCM — réponse unique' },
  { v: 'qcm_multiple', l: 'QCM — réponses multiples' },
  { v: 'vrai_faux', l: 'Vrai / Faux' },
  { v: 'texte_court', l: 'Réponse courte' },
  { v: 'texte_long', l: 'Réponse longue' },
  { v: 'numerique', l: 'Réponse numérique' },
  { v: 'mise_situation', l: 'Mise en situation' },
  { v: 'fichier', l: 'Dépôt de fichier' },
];
const typeLabel = (v) => (TYPES.find(t => t.v === v) || {}).l || v;
const NIVEAUX = [{ v: 'facile', l: 'Facile' }, { v: 'moyen', l: 'Moyen' }, { v: 'difficile', l: 'Difficile' }];

// Mode de gestion des bonnes réponses selon le type.
function optionMode(type) {
  if (type === 'qcm_unique' || type === 'vrai_faux') return 'single';   // une seule bonne réponse
  if (type === 'qcm_multiple') return 'multiple';                       // plusieurs bonnes réponses
  if (type === 'numerique' || type === 'texte_court') return 'accepted'; // réponses acceptées (toutes « bonnes »)
  return 'none';                                                        // correction manuelle
}

const EMPTY = {
  intitule: '', code: '', description: '', category_id: '', sous_categorie: '',
  niveau: 'moyen', type: 'qcm_unique', explication: '', points: 1, duree_sec: '',
  entity_id: '', departement: '', actif: true, options: [],
};

export default function RecrutementQuestions() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [entities, setEntities] = useState([]);
  const [filters, setFilters] = useState({ category_id: '', type: '', niveau: '', actif: '', q: '' });
  const [editing, setEditing] = useState(null); // objet question en édition, ou null
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = {};
    for (const [k, v] of Object.entries(filters)) if (v !== '') params[k] = v;
    try { setRows((await client.get('/rh/recrutement/questions', { params })).data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'Erreur de chargement.'); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    client.get('/rh/recrutement/categories').then(r => setCategories(r.data)).catch(() => {});
    client.get('/entities').then(r => setEntities(r.data)).catch(() => {});
  }, []);

  if (!canManageRhTypes(user)) return <Navigate to="/rh/mes-demandes" replace />;

  async function openNew() { setEditing({ ...EMPTY }); }
  async function openEdit(id) {
    try {
      const q = (await client.get(`/rh/recrutement/questions/${id}`)).data;
      setEditing({ ...EMPTY, ...q, category_id: q.category_id || '', entity_id: q.entity_id || '', duree_sec: q.duree_sec ?? '', options: q.options || [] });
    } catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function duplicate(id) {
    try { await client.post(`/rh/recrutement/questions/${id}/duplicate`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function remove(id) {
    if (!(await confirm('Supprimer cette question ?', { danger: true, confirmLabel: 'Supprimer' }))) return;
    try { await client.delete(`/rh/recrutement/questions/${id}`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  function exportExcel() {
    exportXlsx('Banque de questions recrutement', [
      { key: 'code', label: 'Code' }, { key: 'intitule', label: 'Intitulé' },
      { key: 'category_nom', label: 'Catégorie' }, { key: 'type', label: 'Type' },
      { key: 'niveau', label: 'Niveau' }, { key: 'points', label: 'Points', type: 'number' },
      { key: 'nb_options', label: 'Options', type: 'number' }, { key: 'actif', label: 'Active' },
    ], rows.map(r => ({ ...r, type: typeLabel(r.type) })));
  }

  const catName = (id) => (categories.find(c => c.id === id) || {}).nom || '—';

  return (
    <div>
      <RhSubnav />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Banque de questions</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportExcel} disabled={!rows.length}>⬇ Excel</button>
          <button className="btn btn-primary" onClick={openNew}>+ Nouvelle question</button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 180 }}>Recherche
          <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} placeholder="Intitulé ou code…" />
        </label>
        <label className="field" style={{ minWidth: 160 }}>Catégorie
          <select value={filters.category_id} onChange={e => setFilters(f => ({ ...f, category_id: e.target.value }))}>
            <option value="">Toutes</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 150 }}>Type
          <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
            <option value="">Tous</option>
            {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </label>
        <label className="field" style={{ width: 130 }}>Niveau
          <select value={filters.niveau} onChange={e => setFilters(f => ({ ...f, niveau: e.target.value }))}>
            <option value="">Tous</option>
            {NIVEAUX.map(n => <option key={n.v} value={n.v}>{n.l}</option>)}
          </select>
        </label>
        <label className="field" style={{ width: 130 }}>Statut
          <select value={filters.actif} onChange={e => setFilters(f => ({ ...f, actif: e.target.value }))}>
            <option value="">Toutes</option>
            <option value="true">Actives</option>
            <option value="false">Inactives</option>
          </select>
        </label>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Intitulé</th><th>Catégorie</th><th>Type</th><th>Niveau</th>
              <th style={{ textAlign: 'right' }}>Points</th><th style={{ textAlign: 'center' }}>Options</th>
              <th style={{ textAlign: 'center' }}>Active</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 18 }}>Aucune question.</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.code && <span style={{ color: 'var(--color-text-muted)', marginRight: 6 }}>{r.code}</span>}{r.intitule}</td>
                <td>{r.category_nom || '—'}</td>
                <td>{typeLabel(r.type)}</td>
                <td>{(NIVEAUX.find(n => n.v === r.niveau) || {}).l || r.niveau}</td>
                <td style={{ textAlign: 'right' }}>{Number(r.points)}</td>
                <td style={{ textAlign: 'center' }}>{r.nb_options || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.actif ? '✓' : '—'}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r.id)}>Éditer</button>{' '}
                  <button className="btn btn-secondary btn-sm" onClick={() => duplicate(r.id)}>Dupliquer</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <QuestionEditor
          initial={editing} categories={categories} entities={entities}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function QuestionEditor({ initial, categories, entities, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const mode = optionMode(f.type);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  // À la bascule vers Vrai/Faux, propose Vrai/Faux par défaut si pas d'options.
  function changeType(type) {
    setF(s => {
      let options = s.options;
      if (type === 'vrai_faux' && (!options || options.length !== 2)) options = [{ libelle: 'Vrai', bon: false }, { libelle: 'Faux', bon: false }];
      return { ...s, type, options };
    });
  }

  const opts = f.options || [];
  const setOpt = (i, patch) => setF(s => ({ ...s, options: s.options.map((o, j) => j === i ? { ...o, ...patch } : o) }));
  const setCorrect = (i) => setF(s => ({ ...s, options: s.options.map((o, j) => ({ ...o, bon: mode === 'single' ? j === i : (j === i ? !o.bon : o.bon) })) }));
  const addOpt = () => setF(s => ({ ...s, options: [...(s.options || []), { libelle: '', bon: false }] }));
  const delOpt = (i) => setF(s => ({ ...s, options: s.options.filter((_, j) => j !== i) }));

  async function save() {
    if (!f.intitule.trim()) { setErr("L'intitulé est obligatoire."); return; }
    setSaving(true); setErr('');
    const payload = {
      ...f,
      category_id: f.category_id || null,
      entity_id: f.entity_id || null,
      duree_sec: f.duree_sec === '' ? null : Number(f.duree_sec),
      points: Number(f.points) || 0,
      // Pour les types « réponses acceptées », toutes les lignes sont de bonnes réponses.
      options: mode === 'none' ? [] : (f.options || []).map(o => ({ ...o, bon: mode === 'accepted' ? true : !!o.bon })),
    };
    try {
      if (f.id) await client.put(`/rh/recrutement/questions/${f.id}`, payload);
      else await client.post('/rh/recrutement/questions', payload);
      await onSaved();
    } catch (e) { setErr(e.response?.data?.error || 'Erreur.'); setSaving(false); }
  }

  return (
    <Modal title={f.id ? 'Modifier la question' : 'Nouvelle question'} onClose={onClose} wide>
      {err && <div className="alert alert-danger">{err}</div>}

      {!preview ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label className="field" style={{ width: 150 }}>Type
              <select value={f.type} onChange={e => changeType(e.target.value)}>
                {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 130 }}>Niveau
              <select value={f.niveau} onChange={e => set('niveau', e.target.value)}>
                {NIVEAUX.map(n => <option key={n.v} value={n.v}>{n.l}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 110 }}>Points
              <input type="number" step="0.5" min="0" value={f.points} onChange={e => set('points', e.target.value)} />
            </label>
            <label className="field" style={{ width: 130 }}>Durée (sec.)
              <input type="number" min="0" value={f.duree_sec} onChange={e => set('duree_sec', e.target.value)} placeholder="optionnel" />
            </label>
            <label className="field" style={{ width: 120 }}>Code
              <input value={f.code} onChange={e => set('code', e.target.value)} placeholder="optionnel" />
            </label>
          </div>

          <label className="field">Intitulé de la question
            <textarea value={f.intitule} onChange={e => set('intitule', e.target.value)} style={{ minHeight: 60 }} required />
          </label>
          <label className="field">Description / contexte (optionnel)
            <textarea value={f.description} onChange={e => set('description', e.target.value)} style={{ minHeight: 44 }} />
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label className="field" style={{ minWidth: 180 }}>Catégorie
              <select value={f.category_id} onChange={e => set('category_id', e.target.value)}>
                <option value="">—</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </label>
            <label className="field" style={{ minWidth: 150 }}>Sous-catégorie
              <input value={f.sous_categorie} onChange={e => set('sous_categorie', e.target.value)} placeholder="optionnel" />
            </label>
            <label className="field" style={{ minWidth: 160 }}>Société
              <select value={f.entity_id} onChange={e => set('entity_id', e.target.value)}>
                <option value="">Groupe (toutes)</option>
                {entities.map(en => <option key={en.id} value={en.id}>{en.nom}</option>)}
              </select>
            </label>
          </div>

          {/* Options / bonnes réponses */}
          {mode === 'none' ? (
            <div className="alert" style={{ fontSize: 13 }}>Ce type de question se corrige manuellement (aucune proposition à saisir).</div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {mode === 'accepted' ? 'Réponses acceptées (correction automatique)' : 'Propositions de réponse'}
                {mode !== 'accepted' && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> — cochez la/les bonne(s) réponse(s)</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {opts.map((o, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {mode !== 'accepted' && (
                      <input type={mode === 'single' ? 'radio' : 'checkbox'} checked={!!o.bon}
                        onChange={() => setCorrect(i)} title="Bonne réponse" />
                    )}
                    <input style={{ flex: 1 }} value={o.libelle} onChange={e => setOpt(i, { libelle: e.target.value })}
                      placeholder={mode === 'accepted' ? 'Valeur acceptée' : 'Libellé de la proposition'} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => delOpt(i)}>✕</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={addOpt}>
                + {mode === 'accepted' ? 'Ajouter une valeur acceptée' : 'Ajouter une proposition'}
              </button>
            </div>
          )}

          <label className="field">Explication du corrigé (interne — jamais montré au candidat)
            <textarea value={f.explication} onChange={e => set('explication', e.target.value)} style={{ minHeight: 44 }} />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={!!f.actif} onChange={e => set('actif', e.target.checked)} /> Question active
          </label>
        </div>
      ) : (
        <QuestionPreview f={f} mode={mode} catName={(categories.find(c => c.id === Number(f.category_id)) || {}).nom} />
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-secondary" onClick={() => setPreview(p => !p)}>{preview ? '← Éditer' : 'Aperçu'}</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

// Aperçu « côté candidat » (sans révéler les bonnes réponses).
function QuestionPreview({ f, mode, catName }) {
  const opts = f.options || [];
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
        {typeLabel(f.type)} · {Number(f.points)} pt · {catName || 'Sans catégorie'}
      </div>
      <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{f.intitule || '(intitulé vide)'}</div>
      {f.description && <div style={{ color: 'var(--color-text-muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{f.description}</div>}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(mode === 'single' || mode === 'multiple') && opts.map((o, i) => (
          <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type={mode === 'single' ? 'radio' : 'checkbox'} disabled /> {o.libelle || '(vide)'}
          </label>
        ))}
        {mode === 'accepted' && <input disabled placeholder={f.type === 'numerique' ? 'Réponse numérique' : 'Votre réponse'} style={{ maxWidth: 260 }} />}
        {mode === 'none' && f.type !== 'fichier' && <textarea disabled placeholder="Zone de réponse du candidat" style={{ minHeight: 60 }} />}
        {f.type === 'fichier' && <input type="file" disabled />}
      </div>
    </div>
  );
}
