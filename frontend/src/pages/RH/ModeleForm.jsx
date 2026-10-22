import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import RhSubnav from './RhSubnav';

// Builder d'un modèle d'évaluation : en-tête + sélection de compétences piochées dans le
// référentiel (groupées par catégorie, cases à cocher).
export default function ModeleForm() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();

  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [posteCible, setPosteCible] = useState('');
  const [echelleMax, setEchelleMax] = useState(5);
  const [actif, setActif] = useState(true);
  const [categories, setCategories] = useState([]);
  const [competences, setCompetences] = useState([]);
  const [selected, setSelected] = useState({}); // { competence_id: true }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    client.get('/rh/evaluation/categories').then(r => setCategories(r.data)).catch(() => {});
    client.get('/rh/evaluation/competences').then(r => setCompetences(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editing) return;
    client.get(`/rh/evaluation/templates/${id}`).then(r => {
      const t = r.data;
      setNom(t.nom); setDescription(t.description || ''); setPosteCible(t.poste_cible || '');
      setEchelleMax(t.echelle_max || 5); setActif(t.actif);
      const sel = {}; (t.items || []).forEach(it => { if (it.competence_id) sel[it.competence_id] = true; });
      setSelected(sel); setLoaded(true);
    }).catch(() => { setError('Modèle introuvable.'); setLoaded(true); });
  }, [editing, id]);

  const byCat = useMemo(() => {
    const map = {};
    for (const c of competences) {
      if (c.actif === false) continue;
      if (!map[c.category_id]) map[c.category_id] = [];
      map[c.category_id].push(c);
    }
    return map;
  }, [competences]);
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  function toggle(cid) { setSelected(s => ({ ...s, [cid]: !s[cid] })); }

  async function save() {
    if (!nom.trim()) { setError('Le nom du modèle est obligatoire.'); return; }
    const items = competences.filter(c => selected[c.id]).map(c => ({
      competence_id: c.id, categorie_libelle: (catById[c.category_id]?.libelle) || null, libelle: c.libelle,
    }));
    if (items.length === 0) { setError('Sélectionnez au moins une compétence.'); return; }
    setBusy(true); setError('');
    try {
      const payload = { nom: nom.trim(), description, poste_cible: posteCible, echelle_max: Number(echelleMax) || 5, actif, items };
      if (editing) await client.put(`/rh/evaluation/templates/${id}`, payload);
      else await client.post('/rh/evaluation/templates', payload);
      nav('/rh/evaluation/modeles');
    } catch (e) { setError(e?.response?.data?.error || 'Erreur.'); }
    finally { setBusy(false); }
  }

  if (!loaded) return <div><RhSubnav /><p style={{ padding: 16 }}>Chargement…</p></div>;
  const orderedCats = [...categories].sort((a, b) => (a.ordre - b.ordre) || a.libelle.localeCompare(b.libelle));

  return (
    <div>
      <RhSubnav />
      <div style={{ padding: 16, maxWidth: 920 }}>
        <h2 style={{ marginTop: 0 }}>{editing ? 'Modifier' : 'Nouveau'} modèle d'évaluation</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 12 }}>
          <label>Nom
            <input value={nom} onChange={e => setNom(e.target.value)} style={{ display: 'block', width: '100%' }} />
          </label>
          <label>Poste cible (optionnel)
            <input value={posteCible} onChange={e => setPosteCible(e.target.value)} style={{ display: 'block', width: '100%' }} />
          </label>
          <label>Barème (max)
            <input type="number" min="2" max="10" value={echelleMax} onChange={e => setEchelleMax(e.target.value)} style={{ display: 'block', width: 100 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 22 }}>
            <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} /> Actif
          </label>
        </div>
        <label style={{ display: 'block', marginBottom: 16 }}>Description
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ display: 'block', width: '100%' }} />
        </label>

        <h3>Compétences du modèle <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({selectedCount} sélectionnée(s))</span></h3>
        {competences.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>Aucune compétence dans le référentiel. Ajoutez-en d'abord dans RH → Compétences.</p>}
        {orderedCats.map(cat => {
          const items = byCat[cat.id] || [];
          if (items.length === 0) return null;
          return (
            <div key={cat.id} style={{ marginBottom: 12, border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: 6 }}>{cat.libelle}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 6 }}>
                {items.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input type="checkbox" checked={!!selected[c.id]} onChange={() => toggle(c.id)} /> {c.libelle}
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={() => nav('/rh/evaluation/modeles')} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
