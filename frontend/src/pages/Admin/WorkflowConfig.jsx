import { useEffect, useState } from 'react';
import client from '../../api/client';

// Éditeur simple des étapes du workflow "demande_achat" — voir SPEC.md §3.2 : le moteur lit
// cette configuration en base, l'enchaînement des étapes n'est jamais codé en dur côté serveur.

// Ces 4 étapes correspondent à des actions fixes du service achat (ajout de lignes, envoi des
// devis, sélection du devis...) codées explicitement côté serveur — leur "code" est un ancrage
// technique, pas une simple étiquette. On peut renommer leur nom affiché, pas leur code.
const PROTECTED_CODES = ['soumission', 'analyse_achat', 'devis', 'validation_achat'];
const ROLE_OPTIONS = ['service_achat', 'controle_gestion', 'finances', 'dga'];

export default function WorkflowConfig() {
  const [template, setTemplate] = useState(null);
  const [steps, setSteps] = useState([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [minSuppliers, setMinSuppliers] = useState('');
  const [minSuppliersSaved, setMinSuppliersSaved] = useState(false);

  useEffect(() => {
    client.get('/workflows/demande_achat').then(res => { setTemplate(res.data); setSteps(res.data.steps); });
    client.get('/settings').then(res => setMinSuppliers(res.data.min_suppliers_devis ?? '2'));
  }, []);

  async function saveMinSuppliers() {
    setMinSuppliersSaved(false);
    await client.put('/settings/min_suppliers_devis', { value: minSuppliers });
    setMinSuppliersSaved(true);
  }

  function updateStep(id, field, value) {
    setSteps(steps.map(s => s.id === id ? { ...s, [field]: value } : s));
    setSaved(false);
  }

  function moveStep(fromId, toId) {
    if (fromId === toId) return;
    const ordered = [...steps].sort((a, b) => a.ordre - b.ordre);
    const fromIdx = ordered.findIndex(s => s.id === fromId);
    const toIdx = ordered.findIndex(s => s.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    setSteps(ordered.map((s, i) => ({ ...s, ordre: i + 1 })));
    setSaved(false);
  }

  async function save() {
    setError('');
    setSaved(false);
    const codes = steps.map(s => s.code.trim());
    if (codes.some(c => !c)) return setError('Chaque étape doit avoir un code non vide.');
    if (new Set(codes).size !== codes.length) return setError('Les codes des étapes doivent être uniques.');
    try {
      const res = await client.put('/workflows/demande_achat', { steps });
      setSteps(res.data.steps);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue.');
    }
  }

  if (!template) return <p>Chargement…</p>;

  const sortedSteps = [...steps].sort((a, b) => a.ordre - b.ordre);

  return (
    <div>
      <h1 className="page-title">Configuration du workflow — {template.nom}</h1>

      <section className="card" style={{ maxWidth: 480 }}>
        <h2>Paramètres</h2>
        <label className="field">
          Nombre minimum de fournisseurs à consulter avant de lancer une demande de devis
          <input type="number" min="1" value={minSuppliers} onChange={e => { setMinSuppliers(e.target.value); setMinSuppliersSaved(false); }} style={{ width: 100 }} />
        </label>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={saveMinSuppliers} className="btn btn-primary btn-sm">Enregistrer</button>
          {minSuppliersSaved && <span style={{ color: 'var(--color-success-fg)', fontSize: 13 }}>Enregistré.</span>}
        </div>
      </section>

      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 20 }}>
        Glissez une ligne par sa poignée (⠿) pour changer son ordre dans le circuit.
      </p>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th><th>Ordre</th><th>Code</th><th>Nom</th>
                <th>Rôle requis</th><th>Commentaire si refus</th>
                <th>Comportement si refus</th><th>Retour vers</th>
              </tr>
            </thead>
            <tbody>
              {sortedSteps.map(s => {
                const protectedCode = PROTECTED_CODES.includes(s.code);
                return (
                  <tr
                    key={s.id}
                    draggable
                    onDragStart={() => setDraggingId(s.id)}
                    onDragEnd={() => { setDraggingId(null); setOverId(null); }}
                    onDragOver={e => { e.preventDefault(); if (draggingId !== null && s.id !== overId) setOverId(s.id); }}
                    onDrop={e => { e.preventDefault(); if (draggingId !== null) moveStep(draggingId, s.id); setDraggingId(null); setOverId(null); }}
                    style={{
                      opacity: draggingId === s.id ? 0.4 : 1,
                      borderTop: overId === s.id && draggingId !== s.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                    }}
                  >
                    <td style={{ cursor: 'grab', color: 'var(--color-text-faint)', fontSize: 16 }} title="Glisser pour réordonner">⠿</td>
                    <td>{s.ordre}</td>
                    <td>
                      {protectedCode
                        ? <span title="Étape fixe du circuit achat interne : le code n'est pas modifiable.">{s.code} 🔒</span>
                        : <input value={s.code} onChange={e => updateStep(s.id, 'code', e.target.value)} style={{ width: 130 }} />}
                    </td>
                    <td><input value={s.nom} onChange={e => updateStep(s.id, 'nom', e.target.value)} /></td>
                    <td>
                      <select value={s.role_code_requis || ''} onChange={e => updateStep(s.id, 'role_code_requis', e.target.value || null)}>
                        <option value="">— (étape système)</option>
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" checked={!!s.commentaire_obligatoire_si_refus} onChange={e => updateStep(s.id, 'commentaire_obligatoire_si_refus', e.target.checked)} /></td>
                    <td>
                      <select value={s.comportement_si_refus || ''} onChange={e => updateStep(s.id, 'comportement_si_refus', e.target.value || null)}>
                        <option value="">—</option>
                        <option value="retour_etape_precedente">Retour à l'étape précédente</option>
                        <option value="annulation">Annulation</option>
                      </select>
                    </td>
                    <td>
                      <select value={s.retour_step_code || ''} onChange={e => updateStep(s.id, 'retour_step_code', e.target.value || null)}>
                        <option value="">—</option>
                        {steps.filter(o => o.id !== s.id).map(o => <option key={o.id} value={o.code}>{o.code}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} className="btn btn-primary">Enregistrer</button>
        {saved && <span style={{ color: 'var(--color-success-fg)', fontSize: 13 }}>Enregistré.</span>}
        {error && <span style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}
