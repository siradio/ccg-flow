import { useEffect, useRef, useState } from 'react';
import client from '../../api/client';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

// Éditeur simple des étapes du workflow "demande_achat" — voir SPEC.md §3.2 : le moteur lit
// cette configuration en base, l'enchaînement des étapes n'est jamais codé en dur côté serveur.

// Ces étapes correspondent à des actions fixes codées explicitement côté serveur (ajout de
// lignes, envoi des devis, sélection du devis, validation de l'expression de besoin par la
// DGA...) — leur "code" est un ancrage technique, pas une simple étiquette. On peut renommer
// leur nom affiché, pas leur code, ni les supprimer.
const PROTECTED_CODES = ['expression_besoin', 'soumission', 'analyse_achat', 'devis', 'validation_achat'];
const ROLE_OPTIONS = ['service_achat', 'controle_gestion', 'finances', 'validateur_besoin'];

export default function WorkflowConfig() {
  const confirm = useConfirm();
  const { t } = useI18n();
  const [template, setTemplate] = useState(null);
  const [steps, setSteps] = useState([]);
  const [savedMessage, setSavedMessage] = useState('');
  const [error, setError] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [minSuppliers, setMinSuppliers] = useState('');
  const [minSuppliersSaved, setMinSuppliersSaved] = useState(false);
  // Id négatif purement local, jamais envoyé tel quel en base — le backend traite tout id absent
  // de ses lignes existantes comme une étape à créer (voir PUT /workflows/:moduleCode).
  const nextTempId = useRef(-1);

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
    setSavedMessage('');
  }

  async function deleteStep(id) {
    setError('');
    const target = steps.find(s => s.id === id);
    if (!target) return;
    const orphaned = steps.find(s => s.id !== id && s.retour_step_code === target.code);
    if (orphaned) {
      setError(t('adm.wf.err.cantDelete', { target: target.nom, orphaned: orphaned.nom }));
      return;
    }
    const ok = await confirm(t('adm.wf.confirmDelete', { nom: target.nom }), { danger: true, confirmLabel: t('common.delete') });
    if (!ok) return;
    const remaining = steps.filter(s => s.id !== id).sort((a, b) => a.ordre - b.ordre);
    setSteps(remaining.map((s, i) => ({ ...s, ordre: i + 1 })));
    setSavedMessage('');
  }

  // Nouvelle étape de validation générique — sur le même modèle que Contrôle de Gestion/Finances/
  // DGA (seules étapes librement configurables du circuit, voir PROTECTED_CODES) : un rôle requis,
  // et par défaut un retour vers "validation_achat" en cas de refus, comme ses semblables. Insérée
  // juste avant l'étape système finale (génération du BC) — c'est la seule zone du circuit que le
  // moteur générique parcourt dynamiquement par ordre (purchase-requests.service.js#validateStep),
  // donc la seule où une étape ajoutée ici sera réellement prise en compte.
  function addStep() {
    setError('');
    const sorted = [...steps].sort((a, b) => a.ordre - b.ordre);
    // === null (pas juste falsy) : ne pas confondre avec une étape déjà ajoutée mais encore non
    // configurée ('' en attente d'un rôle), qui apparaîtrait sinon avant la vraie étape système.
    const systemIdx = sorted.findIndex(s => s.role_code_requis === null);
    const insertAt = systemIdx === -1 ? sorted.length : systemIdx;
    const newStep = {
      id: nextTempId.current--,
      ordre: 0, // recalculé juste après par la renumérotation
      code: '',
      // Nom PERSISTÉ (affiché à tous via WorkflowTimeline) : littéral FR comme les autres données
      // stockées — l'admin le renomme ensuite. Ne pas passer par t() (dépendrait de la langue de l'admin).
      nom: 'Nouvelle étape',
      role_code_requis: '',
      commentaire_obligatoire_si_refus: true,
      comportement_si_refus: 'retour_etape_precedente',
      retour_step_code: 'validation_achat',
      sla_jours: null,
    };
    sorted.splice(insertAt, 0, newStep);
    setSteps(sorted.map((s, i) => ({ ...s, ordre: i + 1 })));
    setSavedMessage('');
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
    setSavedMessage('');
  }

  async function save() {
    setError('');
    setSavedMessage('');
    const codes = steps.map(s => s.code.trim());
    if (codes.some(c => !c)) return setError(t('adm.wf.err.emptyCode'));
    if (new Set(codes).size !== codes.length) return setError(t('adm.wf.err.uniqueCode'));
    // '' (chaîne vide, jamais produite que par addStep()) = pas encore configurée — un vrai
    // "— (étape système)" choisi explicitement vaut null, jamais ''. Une seule étape système (sans
    // rôle) doit exister au final : c'est la génération automatique du bon de commande, qui
    // termine le circuit ; une étape de validation laissée sans rôle serait prise à tort pour cette
    // étape terminale et court-circuiterait tout ce qui suit.
    const missingRole = steps.find(s => s.role_code_requis === '');
    if (missingRole) return setError(t('adm.wf.err.needRole', { step: missingRole.nom || missingRole.code }));
    try {
      const res = await client.put('/workflows/demande_achat', { steps });
      setSteps(res.data.steps);
      setTemplate(res.data);
      setSavedMessage(res.data.versioned
        ? t('adm.wf.savedVersioned')
        : t('adm.common.savedShort'));
    } catch (err) {
      setError(err.response?.data?.error || t('adm.common.genericError'));
    }
  }

  if (!template) return <p>{t('adm.common.loading')}</p>;

  const sortedSteps = [...steps].sort((a, b) => a.ordre - b.ordre);

  return (
    <div>
      <h1 className="page-title">{t('adm.wf.title', { nom: template.nom })}</h1>

      <section className="card" style={{ maxWidth: 480 }}>
        <h2>{t('adm.wf.params')}</h2>
        <label className="field">
          {t('adm.wf.minSuppliersLabel')}
          <input type="number" min="1" value={minSuppliers} onChange={e => { setMinSuppliers(e.target.value); setMinSuppliersSaved(false); }} style={{ width: 100 }} />
        </label>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={saveMinSuppliers} className="btn btn-primary btn-sm">{t('common.save')}</button>
          {minSuppliersSaved && <span style={{ color: 'var(--color-success-fg)', fontSize: 13 }}>{t('adm.common.savedShort')}</span>}
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          {t('adm.wf.dragHint')}
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addStep}>{t('adm.wf.addStep')}</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th><th>{t('adm.wf.col.ordre')}</th><th>{t('adm.wf.col.code')}</th><th>{t('adm.wf.col.nom')}</th>
                <th>{t('adm.wf.col.role')}</th><th>{t('adm.wf.col.commentIfRefus')}</th>
                <th>{t('adm.wf.col.behaviorIfRefus')}</th><th>{t('adm.wf.col.returnTo')}</th><th title={t('adm.wf.col.slaTitle')}>{t('adm.wf.col.sla')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sortedSteps.map(s => {
                const protectedCode = PROTECTED_CODES.includes(s.code);
                // strictement null (pas '') : '' ne veut dire que "pas encore configurée" pour une étape
                // fraîchement ajoutée (addStep()), à ne pas confondre avec la vraie étape système.
                const systemStep = !protectedCode && s.role_code_requis === null; // génération auto du BC — jamais supprimable ni déplaçable
                const locked = protectedCode || systemStep;
                return (
                  <tr
                    key={s.id}
                    draggable={!locked}
                    onDragStart={() => !locked && setDraggingId(s.id)}
                    onDragEnd={() => { setDraggingId(null); setOverId(null); }}
                    onDragOver={e => { if (locked) return; e.preventDefault(); if (draggingId !== null && s.id !== overId) setOverId(s.id); }}
                    onDrop={e => { if (locked) return; e.preventDefault(); if (draggingId !== null) moveStep(draggingId, s.id); setDraggingId(null); setOverId(null); }}
                    style={{
                      opacity: draggingId === s.id ? 0.4 : 1,
                      borderTop: overId === s.id && draggingId !== s.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                    }}
                  >
                    <td style={locked ? undefined : { cursor: 'grab', color: 'var(--color-text-faint)', fontSize: 16 }} title={locked ? t('adm.wf.lockedPos') : t('adm.wf.dragReorder')}>
                      {locked ? '' : '⠿'}
                    </td>
                    <td>{s.ordre}</td>
                    <td>
                      {protectedCode
                        ? <span title={t('adm.wf.lockedCode')}>{s.code} 🔒</span>
                        : <input value={s.code} onChange={e => updateStep(s.id, 'code', e.target.value)} style={{ width: 130 }} />}
                    </td>
                    <td><input value={s.nom} onChange={e => updateStep(s.id, 'nom', e.target.value)} /></td>
                    <td>
                      {locked
                        ? <span style={{ color: 'var(--color-text-muted)' }} title={t('adm.wf.lockedRole')}>{s.role_code_requis ? t('adm.role.' + s.role_code_requis) : t('adm.wf.systemStep')}</span>
                        : (
                          <select value={s.role_code_requis} onChange={e => updateStep(s.id, 'role_code_requis', e.target.value)}>
                            <option value="" disabled>{t('adm.wf.choose')}</option>
                            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{t('adm.role.' + r)}</option>)}
                          </select>
                        )}
                    </td>
                    <td><input type="checkbox" checked={!!s.commentaire_obligatoire_si_refus} onChange={e => updateStep(s.id, 'commentaire_obligatoire_si_refus', e.target.checked)} /></td>
                    <td>
                      <select value={s.comportement_si_refus || ''} onChange={e => updateStep(s.id, 'comportement_si_refus', e.target.value || null)}>
                        <option value="">—</option>
                        <option value="retour_etape_precedente">{t('adm.wf.behavior.return')}</option>
                        <option value="annulation">{t('adm.wf.behavior.cancel')}</option>
                      </select>
                    </td>
                    <td>
                      <select value={s.retour_step_code || ''} onChange={e => updateStep(s.id, 'retour_step_code', e.target.value || null)}>
                        <option value="">—</option>
                        {steps.filter(o => o.id !== s.id).map(o => <option key={o.id} value={o.code}>{o.code}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="number" min="0" value={s.sla_jours ?? ''} placeholder="—" style={{ width: 70 }}
                        title={t('adm.wf.slaInputTitle')}
                        onChange={e => updateStep(s.id, 'sla_jours', e.target.value === '' ? null : Number(e.target.value))} />
                    </td>
                    <td>
                      {!protectedCode && !systemStep && (
                        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => deleteStep(s.id)}>{t('common.delete')}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} className="btn btn-primary">{t('common.save')}</button>
        {savedMessage && <span style={{ color: 'var(--color-success-fg)', fontSize: 13 }}>{savedMessage}</span>}
        {error && <span style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}
