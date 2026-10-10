import { useEffect, useRef, useState } from 'react';
import client from '../../api/client';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

// Module « Workflows » — éditeur centralisé de tous les circuits de validation (Demande d'achat,
// Bon de commande commercial, et futurs). Le moteur lit cette configuration en base ; l'enchaînement
// n'est jamais codé en dur côté serveur pour les circuits éditables.
//
// Chaque workflow déclare un « profil d'édition » dans le catalogue serveur (workflow.catalog.js) :
//  - locked=false (ex. Demande d'achat) : ajout/suppression/réordonnancement libres ;
//  - locked=true  (ex. Bon de commande) : circuit figé piloté par le code du moteur — on ne modifie
//    que le nom affiché, le SLA et l'obligation de commentaire.
export default function WorkflowConfig() {
  const confirm = useConfirm();
  const { t } = useI18n();
  const [catalog, setCatalog] = useState([]);
  const [moduleCode, setModuleCode] = useState(null);
  const [template, setTemplate] = useState(null);
  const [steps, setSteps] = useState([]);
  const [savedMessage, setSavedMessage] = useState('');
  const [error, setError] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [minSuppliers, setMinSuppliers] = useState('');
  const [minSuppliersSaved, setMinSuppliersSaved] = useState(false);
  const nextTempId = useRef(-1);

  const entry = catalog.find(c => c.module_code === moduleCode) || null;
  const wfLocked = !!entry?.locked;
  const ROLE_OPTIONS = entry?.roleOptions || [];
  const PROTECTED_CODES = entry?.protectedCodes || [];

  // Charge le catalogue, puis sélectionne le premier workflow par défaut.
  useEffect(() => {
    client.get('/workflows/catalog').then(res => {
      setCatalog(res.data);
      if (res.data.length) setModuleCode(res.data[0].module_code);
    }).catch(() => setError(t('adm.common.genericError')));
  }, []);

  // (Re)charge le workflow sélectionné.
  useEffect(() => {
    if (!moduleCode) return;
    setError(''); setSavedMessage('');
    client.get(`/workflows/${moduleCode}`).then(res => { setTemplate(res.data); setSteps(res.data.steps); });
    if (moduleCode === 'demande_achat') {
      client.get('/settings').then(res => setMinSuppliers(res.data.min_suppliers_devis ?? '2')).catch(() => {});
    }
  }, [moduleCode]);

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

  function addStep() {
    setError('');
    const sorted = [...steps].sort((a, b) => a.ordre - b.ordre);
    const systemIdx = sorted.findIndex(s => s.role_code_requis === null);
    const insertAt = systemIdx === -1 ? sorted.length : systemIdx;
    const newStep = {
      id: nextTempId.current--, ordre: 0, code: '', nom: 'Nouvelle étape',
      role_code_requis: '', commentaire_obligatoire_si_refus: true,
      comportement_si_refus: 'retour_etape_precedente', retour_step_code: 'validation_achat', sla_jours: null,
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
    setError(''); setSavedMessage('');
    if (!wfLocked) {
      const codes = steps.map(s => s.code.trim());
      if (codes.some(c => !c)) return setError(t('adm.wf.err.emptyCode'));
      if (new Set(codes).size !== codes.length) return setError(t('adm.wf.err.uniqueCode'));
      const missingRole = steps.find(s => s.role_code_requis === '');
      if (missingRole) return setError(t('adm.wf.err.needRole', { step: missingRole.nom || missingRole.code }));
    }
    try {
      const res = await client.put(`/workflows/${moduleCode}`, { steps });
      setSteps(res.data.steps);
      setTemplate(res.data);
      setSavedMessage(res.data.versioned ? t('adm.wf.savedVersioned') : t('adm.common.savedShort'));
    } catch (err) {
      setError(err.response?.data?.error || t('adm.common.genericError'));
    }
  }

  if (!catalog.length || !template) return <p>{t('adm.common.loading')}</p>;

  const sortedSteps = [...steps].sort((a, b) => a.ordre - b.ordre);

  return (
    <div>
      <h1 className="page-title">{t('adm.wf.title', { nom: template.nom })}</h1>

      {/* Sélecteur de workflow — centralise tous les circuits configurables. */}
      <section className="card" style={{ maxWidth: 480 }}>
        <label className="field">
          Workflow
          <select value={moduleCode || ''} onChange={e => setModuleCode(e.target.value)}>
            {catalog.map(c => <option key={c.module_code} value={c.module_code}>{c.label}</option>)}
          </select>
        </label>
        {wfLocked && (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10 }}>
            Circuit piloté par le moteur : les étapes, leur ordre et les rôles sont fixes. Vous
            pouvez ajuster le <strong>nom affiché</strong>, le <strong>SLA</strong> et
            l'<strong>obligation de commentaire</strong>.
          </p>
        )}
      </section>

      {moduleCode === 'demande_achat' && (
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
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          {wfLocked ? '' : t('adm.wf.dragHint')}
        </p>
        {!wfLocked && <button type="button" className="btn btn-secondary btn-sm" onClick={addStep}>{t('adm.wf.addStep')}</button>}
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
                const systemStep = !protectedCode && s.role_code_requis === null;
                // Verrou de STRUCTURE (position, code, rôle, suppression) : soit le workflow entier
                // est figé, soit l'étape est protégée/système. Le nom, le SLA et le commentaire
                // restent éditables dans tous les cas.
                const locked = wfLocked || protectedCode || systemStep;
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
                      {(protectedCode || wfLocked)
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
                      {wfLocked
                        ? <span style={{ color: 'var(--color-text-muted)' }}>{s.comportement_si_refus === 'annulation' ? t('adm.wf.behavior.cancel') : s.comportement_si_refus === 'retour_etape_precedente' ? t('adm.wf.behavior.return') : '—'}</span>
                        : (
                          <select value={s.comportement_si_refus || ''} onChange={e => updateStep(s.id, 'comportement_si_refus', e.target.value || null)}>
                            <option value="">—</option>
                            <option value="retour_etape_precedente">{t('adm.wf.behavior.return')}</option>
                            <option value="annulation">{t('adm.wf.behavior.cancel')}</option>
                          </select>
                        )}
                    </td>
                    <td>
                      {wfLocked
                        ? <span style={{ color: 'var(--color-text-muted)' }}>{s.retour_step_code || '—'}</span>
                        : (
                          <select value={s.retour_step_code || ''} onChange={e => updateStep(s.id, 'retour_step_code', e.target.value || null)}>
                            <option value="">—</option>
                            {steps.filter(o => o.id !== s.id).map(o => <option key={o.id} value={o.code}>{o.code}</option>)}
                          </select>
                        )}
                    </td>
                    <td>
                      <input type="number" min="0" value={s.sla_jours ?? ''} placeholder="—" style={{ width: 70 }}
                        title={t('adm.wf.slaInputTitle')}
                        onChange={e => updateStep(s.id, 'sla_jours', e.target.value === '' ? null : Number(e.target.value))} />
                    </td>
                    <td>
                      {!wfLocked && !protectedCode && !systemStep && (
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
