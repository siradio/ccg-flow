import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams, Link } from 'react-router-dom';
import client from '../../../api/client';
import Modal from '../../../components/Modal.jsx';
import RhSubnav, { canManageRhTypes } from '../RhSubnav';
import { useAuth } from '../../../auth/AuthContext';
import { useConfirm } from '../../../components/ConfirmProvider.jsx';

const STATUTS = {
  enregistre: 'Enregistré', test_attribue: 'Test attribué', invitation_generee: 'Invitation générée',
  invitation_envoyee: 'Invitation envoyée', en_attente_demarrage: 'En attente de démarrage',
  test_en_cours: 'Test en cours', test_soumis: 'Test soumis', test_expire: 'Test expiré',
  invitation_expiree: 'Invitation expirée', acces_suspendu: 'Accès suspendu',
  correction_en_attente: 'Correction en attente', evaluation_en_attente: 'Évaluation en attente',
  validation_rh_en_attente: 'Validation RH', resultat_valide: 'Résultat validé',
  retenu: 'Retenu', non_retenu: 'Non retenu', liste_attente: "Liste d'attente",
};

async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }

export default function RecrutementCampaignDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [creds, setCreds] = useState(null);      // { login, password, link } affiché une fois
  const [genFor, setGenFor] = useState(null);     // candidat pour lequel choisir une variante
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try { setC((await client.get(`/rh/recrutement/campaigns/${id}`)).data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!canManageRhTypes(user)) return <Navigate to="/rh/mes-demandes" replace />;
  if (error) return <div><RhSubnav /><div className="alert alert-danger">{error}</div></div>;
  if (!c) return <div><RhSubnav /><p>Chargement…</p></div>;

  function showToast(m) { setToast(m); setTimeout(() => setToast(t => t === m ? '' : t), 2500); }

  async function doGenerate(candidate, variantId) {
    try {
      const r = await client.post(`/rh/recrutement/candidates/${candidate.id}/generate-access`, { variant_id: variantId });
      setGenFor(null); setCreds({ ...r.data, who: `${candidate.prenom} ${candidate.nom}` }); await load();
    } catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function copyAccess(candidate, withLoginOnly) {
    try {
      const a = (await client.get(`/rh/recrutement/candidates/${candidate.id}/access`)).data;
      if (!a) return;
      const text = withLoginOnly ? a.link : `Lien : ${a.link}\nIdentifiant : ${a.login}`;
      showToast(await copy(text) ? 'Copié.' : 'Copie impossible.');
    } catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function send(candidate) {
    try { const r = await client.post(`/rh/recrutement/candidates/${candidate.id}/send-invitation`); showToast(`Invitation envoyée à ${r.data.to}.`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function resetPwd(candidate) {
    try { const r = await client.post(`/rh/recrutement/candidates/${candidate.id}/reset-password`); setCreds({ password: r.data.password, who: `${candidate.prenom} ${candidate.nom}`, resetOnly: true }); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function revoke(candidate) {
    if (!(await confirm('Révoquer l\'accès de ce candidat ? Son lien deviendra inopérant.', { danger: true, confirmLabel: 'Révoquer' }))) return;
    try { await client.post(`/rh/recrutement/candidates/${candidate.id}/revoke`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function reactivate(candidate) {
    try { await client.post(`/rh/recrutement/candidates/${candidate.id}/reactivate`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }
  async function removeCandidate(candidate) {
    if (!(await confirm('Supprimer ce candidat et son accès ?', { danger: true, confirmLabel: 'Supprimer' }))) return;
    try { await client.delete(`/rh/recrutement/candidates/${candidate.id}`); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); }
  }

  const hasTemplate = !!c.template_id;

  return (
    <div>
      <RhSubnav />
      {toast && <div className="alert alert-success" style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000 }}>{toast}</div>}
      <div style={{ margin: '4px 0 12px' }}>
        <Link to="/rh/recrutement/campagnes" style={{ fontSize: 13 }}>← Campagnes</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <h1 className="page-title" style={{ margin: 0 }}>{c.intitule}</h1>
          <span className="badge">{c.statut}</span>
        </div>
        <p className="page-subtitle" style={{ marginTop: 2 }}>
          {[c.poste, c.entity_nom, c.template_titre ? `Modèle : ${c.template_titre}` : null].filter(Boolean).join(' · ')}
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          Resp. RH : {c.rh_prenom ? `${c.rh_prenom} ${c.rh_nom}` : '—'} · Resp. service : {c.resp_prenom ? `${c.resp_prenom} ${c.resp_nom}` : '—'}
        </p>
      </div>

      {!hasTemplate && <div className="alert alert-danger">Aucun modèle de test n'est associé à cette campagne. Modifiez la campagne pour en choisir un avant de générer des accès.</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Candidats</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>+ Candidat</button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Candidat</th><th>Contact</th><th style={{ textAlign: 'center' }}>Variante</th><th>Accès</th><th style={{ textAlign: 'center' }}>Statut</th><th></th></tr>
          </thead>
          <tbody>
            {c.candidates.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 18 }}>Aucun candidat.</td></tr>}
            {c.candidates.map(ca => (
              <tr key={ca.id}>
                <td>{ca.prenom} {ca.nom}{ca.poste && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{ca.poste}</div>}</td>
                <td style={{ fontSize: 13 }}>{ca.email || '—'}{ca.telephone && <div style={{ color: 'var(--color-text-muted)' }}>{ca.telephone}</div>}</td>
                <td style={{ textAlign: 'center' }}>{ca.variant_code || '—'}</td>
                <td style={{ fontSize: 13 }}>
                  {ca.a_invitation
                    ? <span>{ca.invit_login} {!ca.invit_actif && <span style={{ color: 'var(--color-danger,#b42318)' }}>(révoqué)</span>}{ca.invit_sent_at && <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>envoyée</div>}</span>
                    : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                </td>
                <td style={{ textAlign: 'center' }}><span className="badge">{STATUTS[ca.statut] || ca.statut}</span></td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {!ca.a_invitation
                    ? <button className="btn btn-primary btn-sm" disabled={!hasTemplate} onClick={() => setGenFor(ca)}>Générer l'accès</button>
                    : (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => copyAccess(ca, true)} title="Copier le lien">Lien</button>{' '}
                        <button className="btn btn-secondary btn-sm" onClick={() => copyAccess(ca, false)} title="Copier identifiant + lien">Identifiants</button>{' '}
                        <button className="btn btn-secondary btn-sm" disabled={!ca.email} onClick={() => send(ca)}>Envoyer</button>{' '}
                        <button className="btn btn-secondary btn-sm" onClick={() => resetPwd(ca)}>Mdp</button>{' '}
                        <button className="btn btn-secondary btn-sm" onClick={() => setGenFor(ca)}>Régénérer</button>{' '}
                        {ca.invit_actif
                          ? <button className="btn btn-secondary btn-sm" onClick={() => revoke(ca)}>Révoquer</button>
                          : <button className="btn btn-secondary btn-sm" onClick={() => reactivate(ca)}>Réactiver</button>}
                      </>
                    )}{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => removeCandidate(ca)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && <AddCandidateModal campaignId={c.id} onClose={() => setAddOpen(false)} onSaved={async () => { setAddOpen(false); await load(); }} />}
      {genFor && <PickVariantModal candidate={genFor} variants={c.variants} onClose={() => setGenFor(null)} onPick={(vid) => doGenerate(genFor, vid)} />}
      {creds && <CredentialsModal creds={creds} onClose={() => setCreds(null)} />}
    </div>
  );
}

function AddCandidateModal({ campaignId, onClose, onSaved }) {
  const [f, setF] = useState({ nom: '', prenom: '', email: '', telephone: '', poste: '', commentaire_interne: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  async function save() {
    if (!f.nom.trim() || !f.prenom.trim()) { setErr('Nom et prénom obligatoires.'); return; }
    setSaving(true); setErr('');
    try { await client.post(`/rh/recrutement/campaigns/${campaignId}/candidates`, f); await onSaved(); }
    catch (e) { setErr(e.response?.data?.error || 'Erreur.'); setSaving(false); }
  }
  return (
    <Modal title="Nouveau candidat" onClose={onClose}>
      {err && <div className="alert alert-danger">{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <label className="field" style={{ flex: 1 }}>Prénom<input value={f.prenom} onChange={e => set('prenom', e.target.value)} /></label>
          <label className="field" style={{ flex: 1 }}>Nom<input value={f.nom} onChange={e => set('nom', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <label className="field" style={{ flex: 1 }}>E-mail<input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></label>
          <label className="field" style={{ flex: 1 }}>Téléphone<input value={f.telephone} onChange={e => set('telephone', e.target.value)} /></label>
        </div>
        <label className="field">Poste visé<input value={f.poste} onChange={e => set('poste', e.target.value)} /></label>
        <label className="field">Commentaire interne<textarea value={f.commentaire_interne} onChange={e => set('commentaire_interne', e.target.value)} style={{ minHeight: 40 }} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? '…' : 'Ajouter'}</button>
      </div>
    </Modal>
  );
}

function PickVariantModal({ candidate, variants, onClose, onPick }) {
  const [vid, setVid] = useState(candidate.variant_id || (variants[0] && variants[0].id) || '');
  return (
    <Modal title={`Générer l'accès — ${candidate.prenom} ${candidate.nom}`} onClose={onClose}>
      {variants.length === 0 ? (
        <div className="alert alert-danger">Le modèle de la campagne n'a aucune variante. Ajoutez-en une dans le modèle de test.</div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>Choisissez la variante du test à attribuer. Un identifiant et un mot de passe temporaire seront générés.</p>
          <label className="field">Variante
            <select value={vid} onChange={e => setVid(e.target.value)}>
              {variants.map(v => <option key={v.id} value={v.id}>Variante {v.code}{v.libelle ? ` — ${v.libelle}` : ''}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" disabled={!vid} onClick={() => onPick(Number(vid))}>Générer</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function CredentialsModal({ creds, onClose }) {
  const line = (label, value) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ width: 110, color: 'var(--color-text-muted)', fontSize: 13 }}>{label}</span>
      <code style={{ flex: 1, background: 'var(--color-bg-subtle,#f3f4f6)', padding: '4px 8px', borderRadius: 6, wordBreak: 'break-all' }}>{value}</code>
      <button className="btn btn-secondary btn-sm" onClick={() => copy(value)}>Copier</button>
    </div>
  );
  return (
    <Modal title="Accès du candidat" onClose={onClose}>
      <div className="alert" style={{ background: 'var(--color-warn-bg,#fef3c7)', color: 'var(--color-text)', fontSize: 13 }}>
        ⚠️ Le mot de passe n'est affiché qu'une seule fois. Transmettez-le au candidat par un canal séparé du lien.
      </div>
      <div style={{ marginTop: 10 }}>
        <p style={{ fontWeight: 600, marginTop: 0 }}>{creds.who}</p>
        {!creds.resetOnly && creds.link && line('Lien du test', creds.link)}
        {!creds.resetOnly && creds.login && line('Identifiant', creds.login)}
        {line('Mot de passe', creds.password)}
        {!creds.resetOnly && creds.expires_at && <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Valable jusqu'au {new Date(creds.expires_at).toLocaleString('fr-FR')}.</p>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-primary" onClick={onClose}>J'ai noté</button>
      </div>
    </Modal>
  );
}
