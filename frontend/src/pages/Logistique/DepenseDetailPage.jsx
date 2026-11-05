import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, isSuperAdmin } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';
import Modal from '../../components/Modal';
import { useConfirm } from '../../components/ConfirmProvider';
import DepenseFormModal from './DepenseFormModal';
import { StatutBadge } from './DepensesListPage';

const money = n => (n == null || n === '' ? '0' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
const fullName = (p, n) => `${p || ''} ${n || ''}`.trim() || null;

// Frise du circuit : étape faite (✓) / en cours (●) / à venir (○), refus annoté.
function Timeline({ fiche, steps }) {
  if (!steps?.length) return null;
  const approvals = fiche.approvals || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.map(s => {
        const decided = [...approvals].reverse().find(a => a.step_code === s.code && a.statut !== 'en_attente');
        let state = 'pending';
        if (decided?.statut === 'valide') state = 'done';
        if (fiche.statut === 'validee') state = 'done';
        if (fiche.statut === 'en_validation' && fiche.current_step_code === s.code) state = 'current';
        const c = {
          done: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)', mark: '✓' },
          current: { bg: 'var(--status-blue-bg)', fg: 'var(--status-blue-fg)', mark: '●' },
          pending: { bg: 'var(--status-neutral-bg)', fg: 'var(--color-text-muted)', mark: '○' },
        }[state];
        const refus = [...approvals].reverse().find(a => a.step_code === s.code && a.statut === 'refuse');
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: c.bg, color: c.fg, fontSize: 13 }}>{c.mark}</span>
            <span style={{ fontWeight: state === 'current' ? 600 : 400 }}>{s.nom}</span>
            {refus && <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>— refusé{refus.commentaire ? ` : ${refus.commentaire}` : ''}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function DepenseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [fiche, setFiche] = useState(null);
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [decision, setDecision] = useState(null); // 'validate' | 'reject'
  const [comment, setComment] = useState('');

  const load = useCallback(() => {
    client.get(`/logistique/depenses/${id}`)
      .then(r => setFiche(r.data))
      .catch(err => setError(err.response?.data?.error || 'Autorisation introuvable.'));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { client.get('/workflows/autorisation_depense').then(r => setSteps(r.data.steps || [])).catch(() => {}); }, []);

  if (error) return <div><LogistiqueSubnav /><div className="alert alert-danger" style={{ marginTop: 12 }}>{error}</div></div>;
  if (!fiche) return <div><LogistiqueSubnav /><p style={{ marginTop: 12 }}>Chargement…</p></div>;

  const isCreator = fiche.created_by === user.id || isSuperAdmin(user);
  const currentStep = steps.find(s => s.code === fiche.current_step_code);
  const canValidate = fiche.statut === 'en_validation' && currentStep &&
    (isSuperAdmin(user) || (user.roles || []).some(r => r.role_code === currentStep.role_code_requis && Number(r.entity_id) === Number(fiche.entity_id)));

  async function act(path, body) {
    setBusy(true); setError('');
    try { const r = await client.post(`/logistique/depenses/${id}/${path}`, body || {}); setFiche(r.data); }
    catch (err) { setError(err.response?.data?.error || 'Action impossible.'); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!(await confirm('Soumettre cette autorisation dans le circuit de validation ?', { confirmLabel: 'Soumettre' }))) return;
    act('submit');
  }
  async function remove() {
    if (!(await confirm('Supprimer définitivement ce brouillon ?', { danger: true, confirmLabel: 'Supprimer' }))) return;
    setBusy(true);
    try { await client.delete(`/logistique/depenses/${id}`); navigate('/logistique/depenses'); }
    catch (err) { setError(err.response?.data?.error || 'Suppression impossible.'); setBusy(false); }
  }
  async function reopen() {
    if (!(await confirm('Reprendre cette fiche refusée en brouillon pour la corriger ?', { confirmLabel: 'Reprendre' }))) return;
    act('reopen');
  }
  async function sendDecision() {
    await act(decision === 'validate' ? 'validate' : 'reject', { commentaire: comment });
    setDecision(null); setComment('');
  }

  async function downloadPdf() {
    try {
      const r = await client.get(`/logistique/depenses/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { setError('Impossible de générer le PDF.'); }
  }

  const Info = ({ label, children }) => (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 14, marginTop: 2 }}>{children}</div>
    </div>
  );

  return (
    <div>
      <LogistiqueSubnav />
      <button onClick={() => navigate('/logistique/depenses')} style={{ background: 'none', border: 'none', color: 'var(--status-blue-fg)', cursor: 'pointer', padding: 0, marginBottom: 6, fontSize: 13 }}>← Retour à la liste</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{fiche.numero || 'Autorisation de dépense'}</h1>
          <div style={{ marginTop: 6 }}><StatutBadge statut={fiche.statut} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={downloadPdf}>⬇ PDF</button>
          {isCreator && fiche.statut === 'brouillon' && <button className="btn btn-secondary btn-sm" onClick={() => setEditOpen(true)}>Modifier</button>}
          {isCreator && fiche.statut === 'brouillon' && <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>Soumettre</button>}
          {isCreator && fiche.statut === 'brouillon' && <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>Supprimer</button>}
          {isCreator && fiche.statut === 'rejetee' && <button className="btn btn-primary btn-sm" onClick={reopen} disabled={busy}>Reprendre</button>}
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}

      {canValidate && (
        <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--status-blue-fg)' }}>
          <strong>Validation requise — {currentStep.nom}</strong>
          <p style={{ margin: '4px 0 10px', fontSize: 13, color: 'var(--color-text-muted)' }}>Cette fiche attend votre décision.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => { setDecision('validate'); setComment(''); }} disabled={busy}>Valider</button>
            <button className="btn btn-danger btn-sm" onClick={() => { setDecision('reject'); setComment(''); }} disabled={busy}>Refuser</button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Info label="Entité">{fiche.entity_nom}{fiche.bu_nom ? ` — ${fiche.bu_nom}` : ''}</Info>
        <Info label="Service">{fiche.service || '—'}</Info>
        <Info label="Type de dépense">{fiche.expense_type_libelle || '—'}</Info>
        <Info label="Demandeur">{fiche.demandeur_nom || '—'}</Info>
        <Info label="Créée le">{d10(fiche.created_at)}</Info>
        <Info label="Objet">{fiche.objet}</Info>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Désignation</th><th className="num">Quantité</th><th className="num">Prix unitaire</th><th className="num">Montant</th></tr></thead>
            <tbody>
              {(fiche.lignes || []).length === 0 && <tr><td className="empty-row" colSpan={4}>Aucune ligne détaillée.</td></tr>}
              {(fiche.lignes || []).map(l => (
                <tr key={l.id}>
                  <td>{l.designation}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(l.quantite)}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(l.prix_unitaire)}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(l.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 28, padding: '12px 16px', flexWrap: 'wrap', fontSize: 14 }}>
          <div>Montant total : <strong>{money(fiche.montant_total)} {fiche.devise}</strong></div>
          <div>Avance : <strong>{money(fiche.avance)} {fiche.devise}</strong></div>
          <div>Reste à payer : <strong style={{ color: 'var(--status-blue-fg)' }}>{money(fiche.reste_a_payer)} {fiche.devise}</strong></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <section className="card" style={{ flex: '1 1 320px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Circuit de validation</h2>
          <Timeline fiche={fiche} steps={steps} />
        </section>
        <section className="card" style={{ flex: '1 1 320px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Historique des décisions</h2>
          {(fiche.approvals || []).filter(a => a.statut !== 'en_attente').length === 0
            ? <p className="empty-row" style={{ margin: 0 }}>Aucune décision pour l'instant.</p>
            : (fiche.approvals || []).filter(a => a.statut !== 'en_attente').map(a => (
              <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
                <span style={{ color: a.statut === 'valide' ? 'var(--status-green-fg)' : 'var(--color-danger)', fontWeight: 700 }}>
                  {a.statut === 'valide' ? '✓ Validé' : '✗ Refusé'}
                </span>{' '}— {a.step_nom}
                <div style={{ color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {fullName(a.user_prenom, a.user_nom) || '—'} · {d10(a.created_at)}
                  {a.commentaire ? ` — ${a.commentaire}` : ''}
                </div>
              </div>
            ))}
        </section>
      </div>

      {editOpen && (
        <DepenseFormModal user={user} existing={fiche} onClose={() => setEditOpen(false)} onSaved={(a) => { setEditOpen(false); setFiche(a); }} />
      )}

      {decision && (
        <Modal title={decision === 'validate' ? 'Valider cette étape' : "Refuser cette étape"} onClose={() => setDecision(null)}>
          <label className="field" style={{ display: 'block', marginBottom: 12 }}>
            Commentaire{decision === 'reject' ? ' (obligatoire)' : ' (facultatif)'}
            <textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} style={{ width: '100%' }} placeholder={decision === 'validate' ? 'Observation éventuelle…' : 'Motif du refus…'} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn btn-sm ${decision === 'validate' ? 'btn-primary' : 'btn-danger'}`} onClick={sendDecision} disabled={busy}>
              {decision === 'validate' ? 'Confirmer la validation' : 'Confirmer le refus'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setDecision(null)}>Annuler</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
