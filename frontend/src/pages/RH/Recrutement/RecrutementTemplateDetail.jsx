import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams, Link } from 'react-router-dom';
import client from '../../../api/client';
import Modal from '../../../components/Modal.jsx';
import RhSubnav, { canManageRhTypes } from '../RhSubnav';
import { useAuth } from '../../../auth/AuthContext';
import { useConfirm } from '../../../components/ConfirmProvider.jsx';

// Lot 2 — Détail d'un modèle : gestion des variantes (A/B/C…) et de leurs questions. Chaque question
// ajoutée à une variante est figée par un SNAPSHOT (voir backend) → modifier la banque ne change pas
// un test déjà construit.

const STATUTS = { brouillon: 'Brouillon', publie: 'Publié', archive: 'Archivé' };

export default function RecrutementTemplateDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [tpl, setTpl] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setTpl((await client.get(`/rh/recrutement/templates/${id}`)).data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!canManageRhTypes(user)) return <Navigate to="/rh/mes-demandes" replace />;
  if (error) return <div><RhSubnav /><div className="alert alert-danger">{error}</div></div>;
  if (!tpl) return <div><RhSubnav /><p>Chargement…</p></div>;

  async function addVariant() {
    const code = window.prompt('Code de la variante (ex. A, B, C) :');
    if (!code || !code.trim()) return;
    try { await client.post(`/rh/recrutement/templates/${id}/variants`, { code: code.trim() }); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function delVariant(vid) {
    if (!(await confirm('Supprimer cette variante et ses questions ?', { danger: true, confirmLabel: 'Supprimer' }))) return;
    try { await client.delete(`/rh/recrutement/variants/${vid}`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }

  return (
    <div>
      <RhSubnav />
      <div style={{ margin: '4px 0 12px' }}>
        <Link to="/rh/recrutement/modeles" style={{ fontSize: 13 }}>← Modèles</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <h1 className="page-title" style={{ margin: 0 }}>{tpl.titre}</h1>
          <span className="badge">{STATUTS[tpl.statut] || tpl.statut}</span>
        </div>
        <p className="page-subtitle" style={{ marginTop: 2 }}>
          {tpl.poste ? `${tpl.poste} · ` : ''}{tpl.duree_min} min · {tpl.mode_correction === 'auto' ? 'correction auto' : tpl.mode_correction === 'mixte' ? 'correction mixte' : 'correction manuelle'}
          {tpl.melange_questions ? ' · questions mélangées' : ''}{tpl.melange_reponses ? ' · réponses mélangées' : ''}
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Variantes</h2>
        <button className="btn btn-primary btn-sm" onClick={addVariant}>+ Variante</button>
      </div>
      {tpl.variants.length === 0 && <div className="card" style={{ color: 'var(--color-text-muted)' }}>Aucune variante. Ajoutez-en une (A, B, C…) puis composez ses questions.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tpl.variants.map(v => (
          <VariantCard key={v.id} variant={v} onChanged={load} onDelete={() => delVariant(v.id)} />
        ))}
      </div>
    </div>
  );
}

function VariantCard({ variant, onChanged, onDelete }) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [randOpen, setRandOpen] = useState(false);
  const [err, setErr] = useState('');

  const loadQ = useCallback(async () => {
    try { setQuestions((await client.get(`/rh/recrutement/variants/${variant.id}/questions`)).data); }
    catch (e) { setErr(e.response?.data?.error || 'Erreur.'); }
  }, [variant.id]);

  async function toggle() { const n = !open; setOpen(n); if (n && questions == null) await loadQ(); }
  async function afterChange() { await loadQ(); await onChanged(); }
  async function removeQ(vqId) {
    try { await client.delete(`/rh/recrutement/variant-questions/${vqId}`); await afterChange(); }
    catch (e) { setErr(e.response?.data?.error || 'Erreur.'); }
  }
  async function move(idx, dir) {
    const arr = [...questions]; const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setQuestions(arr);
    try { await client.put(`/rh/recrutement/variants/${variant.id}/reorder`, { ids: arr.map(x => x.id) }); await onChanged(); }
    catch (e) { setErr(e.response?.data?.error || 'Erreur.'); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={toggle}>{open ? '▾' : '▸'}</button>
        <strong style={{ fontSize: 16 }}>Variante {variant.code}</strong>
        {variant.libelle && <span style={{ color: 'var(--color-text-muted)' }}>{variant.libelle}</span>}
        <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>· {variant.nb_questions} question(s) · barème {Number(variant.bareme)} pt</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setPickOpen(true); }}>+ Depuis la banque</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setRandOpen(true)}>Aléatoire</button>
          <button className="btn btn-danger btn-sm" onClick={onDelete}>Suppr. variante</button>
        </div>
      </div>
      {err && <div className="alert alert-danger" style={{ marginTop: 8 }}>{err}</div>}

      {open && (
        <div style={{ marginTop: 10 }}>
          {questions == null ? <p style={{ color: 'var(--color-text-muted)' }}>Chargement…</p>
            : questions.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>Aucune question. Ajoutez-en depuis la banque ou par tirage aléatoire.</p>
            : (
              <ol style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {questions.map((q, i) => (
                  <li key={q.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1 }}>{q.snapshot.intitule} <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>({q.snapshot.type}, {Number(q.snapshot.points)} pt)</span></span>
                      <button className="btn btn-secondary btn-sm" title="Monter" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                      <button className="btn btn-secondary btn-sm" title="Descendre" onClick={() => move(i, 1)} disabled={i === questions.length - 1}>↓</button>
                      <button className="btn btn-danger btn-sm" onClick={() => removeQ(q.id)}>✕</button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
        </div>
      )}

      {pickOpen && <PickFromBankModal variantId={variant.id} onClose={() => setPickOpen(false)} onAdded={async () => { setPickOpen(false); setOpen(true); await afterChange(); }} />}
      {randOpen && <RandomFillModal variantId={variant.id} onClose={() => setRandOpen(false)} onDone={async () => { setRandOpen(false); setOpen(true); await afterChange(); }} />}
    </div>
  );
}

function PickFromBankModal({ variantId, onClose, onAdded }) {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sel, setSel] = useState({});
  const [filters, setFilters] = useState({ category_id: '', q: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const params = { actif: 'true' };
    if (filters.category_id) params.category_id = filters.category_id;
    if (filters.q) params.q = filters.q;
    try { setRows((await client.get('/rh/recrutement/questions', { params })).data); } catch (e) { setErr(e.response?.data?.error || 'Erreur.'); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { client.get('/rh/recrutement/categories').then(r => setCategories(r.data)).catch(() => {}); }, []);

  const toggle = (id) => setSel(s => ({ ...s, [id]: !s[id] }));
  const chosen = Object.keys(sel).filter(k => sel[k]).map(Number);

  async function add() {
    if (!chosen.length) return;
    setBusy(true);
    try { await client.post(`/rh/recrutement/variants/${variantId}/questions`, { question_ids: chosen }); await onAdded(); }
    catch (e) { setErr(e.response?.data?.error || 'Erreur.'); setBusy(false); }
  }

  return (
    <Modal title="Ajouter des questions depuis la banque" onClose={onClose} wide>
      {err && <div className="alert alert-danger">{err}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <input placeholder="Rechercher…" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} style={{ minWidth: 180 }} />
        <select value={filters.category_id} onChange={e => setFilters(f => ({ ...f, category_id: e.target.value }))}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
        {rows.length === 0 && <p style={{ padding: 14, color: 'var(--color-text-muted)' }}>Aucune question active.</p>}
        {rows.map(r => (
          <label key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid var(--color-border)' }}>
            <input type="checkbox" checked={!!sel[r.id]} onChange={() => toggle(r.id)} />
            <span style={{ flex: 1 }}>{r.intitule}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.category_nom || '—'} · {Number(r.points)} pt</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{chosen.length} sélectionnée(s)</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={!chosen.length || busy} onClick={add}>{busy ? '…' : `Ajouter (${chosen.length})`}</button>
        </div>
      </div>
    </Modal>
  );
}

function RandomFillModal({ variantId, onClose, onDone }) {
  const [categories, setCategories] = useState([]);
  const [f, setF] = useState({ count: 10, category_id: '', niveau: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  useEffect(() => { client.get('/rh/recrutement/categories').then(r => setCategories(r.data)).catch(() => {}); }, []);

  async function run() {
    setBusy(true); setErr('');
    try {
      const r = await client.post(`/rh/recrutement/variants/${variantId}/fill-random`, { count: Number(f.count), category_id: f.category_id || null, niveau: f.niveau || null });
      setResult(r.data);
    } catch (e) { setErr(e.response?.data?.error || 'Erreur.'); setBusy(false); }
  }

  return (
    <Modal title="Remplissage aléatoire depuis la banque" onClose={onClose}>
      {err && <div className="alert alert-danger">{err}</div>}
      {result ? (
        <div>
          <p>{result.added} question(s) ajoutée(s){result.added < result.demande ? ` (sur ${result.demande} demandées — banque insuffisante après exclusion des doublons).` : '.'}</p>
          <div style={{ textAlign: 'right' }}><button className="btn btn-primary" onClick={onDone}>Fermer</button></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Tire au hasard des questions actives (hors doublons déjà présents dans la variante).</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label className="field" style={{ width: 120 }}>Nombre
              <input type="number" min="1" max="200" value={f.count} onChange={e => setF(s => ({ ...s, count: e.target.value }))} />
            </label>
            <label className="field" style={{ minWidth: 160 }}>Catégorie
              <select value={f.category_id} onChange={e => setF(s => ({ ...s, category_id: e.target.value }))}>
                <option value="">Toutes</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 130 }}>Niveau
              <select value={f.niveau} onChange={e => setF(s => ({ ...s, niveau: e.target.value }))}>
                <option value="">Tous</option>
                <option value="facile">Facile</option><option value="moyen">Moyen</option><option value="difficile">Difficile</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? '…' : 'Tirer'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
