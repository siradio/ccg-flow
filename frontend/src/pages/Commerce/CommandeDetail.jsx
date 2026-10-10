import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';

const STATUT_LABEL = { brouillon: 'Brouillon', en_validation: 'En validation', valide: 'Validé', rejetee: 'Rejeté', annulee: 'Annulé' };
const STATUT_COLOR = { brouillon: '#6b7280', en_validation: '#b45309', valide: '#128a54', rejetee: '#dc2626', annulee: '#6b7280' };
const fmt = n => Number(n || 0).toLocaleString('fr-FR');

export default function CommandeDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const canEdit = hasSubModuleLevel(user, 'commerce.commandes', 'edition');
  const sa = (user?.roles || []).some(r => r.role_code === 'super_admin');
  const hasRole = code => sa || (user?.roles || []).some(r => r.role_code === code);
  // BU habilitées : si l'utilisateur a des BU accordées, il ne confirme le stock que pour celles-ci
  // (sans octroi de BU => non restreint, comme la couche d'accès Stock existante).
  const buGrants = (user?.businessUnits || []).map(Number);
  const canConfirmBU = buId => sa || buGrants.length === 0 || buGrants.includes(Number(buId));

  const [c, setC] = useState(null);
  const [wf, setWf] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retour, setRetour] = useState(null); // { target, commentaire }

  function load() {
    client.get(`/commerce/commandes/${id}`).then(r => setC(r.data)).catch(() => setError('Commande introuvable.'));
    client.get(`/commerce/commandes/${id}/workflow`).then(r => setWf(r.data)).catch(() => setWf(null));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function call(path, body, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true); setError('');
    try { await client.post(`/commerce/commandes/${id}/${path}`, body || {}); setRetour(null); load(); }
    catch (e) { setError(e?.response?.data?.error || 'Erreur.'); }
    finally { setBusy(false); }
  }

  async function submit() {
    setBusy(true); setError('');
    try { await client.post(`/commerce/commandes/${id}/submit`, {}); load(); }
    catch (e) {
      const d = e?.response?.data;
      if (d?.code === 'motif_requis') {
        const m = window.prompt(`Remplissage ${d.taux}% < seuil ${d.seuil}%.\nMotif de sous-charge (obligatoire) :`);
        if (m && m.trim()) { try { await client.post(`/commerce/commandes/${id}/submit`, { motif_sous_charge: m.trim() }); load(); } catch (e2) { setError(e2?.response?.data?.error || 'Erreur.'); } }
        else setError('Soumission annulée : motif requis.');
      } else setError(d?.error || 'Erreur à la soumission.');
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Supprimer définitivement ce brouillon ?')) return;
    try { await client.delete(`/commerce/commandes/${id}`); nav('/commerce/commandes'); }
    catch (e) { setError(e?.response?.data?.error || 'Erreur.'); }
  }
  async function openPdf() {
    try {
      const res = await client.get(`/commerce/commandes/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setError('PDF indisponible (disponible après validation complète).'); }
  }

  if (error && !c) return <div><CommerceSubnav /><p style={{ padding: 16, color: 'var(--color-danger)' }}>{error}</p></div>;
  if (!c) return <div><CommerceSubnav /><p style={{ padding: 16 }}>Chargement…</p></div>;

  const unite = c.type_formulaire === 'yaourt' ? 'casier' : 'carton';
  const benef = c.beneficiaire_type === 'commercial'
    ? `${c.commercial_code || ''} ${c.commercial_nom || ''}`.trim()
    : `${c.grossiste_code || ''} ${c.grossiste_nom || ''}`.trim();
  const totalQ = c.type_formulaire === 'yaourt' ? c.total_casiers : c.total_cartons;
  const Info = ({ l, v }) => (<div style={{ minWidth: 170 }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{l}</div><div>{v || '—'}</div></div>);

  const steps = (wf?.steps || []).filter(s => s.role_code_requis);
  const current = (wf?.steps || []).find(s => s.id === wf?.current_step_id);
  const lastValForStep = (stepId) => [...(wf?.validations || [])].reverse().find(v => v.step_id === stepId);
  const stepState = (s) => {
    const v = lastValForStep(s.id);
    if (wf?.current_step_id === s.id && c.statut === 'en_validation') return { label: 'En cours', color: '#b45309' };
    if (v?.statut === 'validee') return { label: 'Validé', color: '#128a54' };
    if (v?.statut === 'retournee') return { label: 'Retourné', color: '#dc2626' };
    return { label: 'En attente', color: '#9ca3af' };
  };

  const atStep = (code) => c.statut === 'en_validation' && current?.code === code;
  const canValidateCurrent = current && atStep(current.code) && current.code !== 'controle_stock' && hasRole(current.role_code_requis);
  const canStock = atStep('controle_stock') && hasRole('gestionnaire_stock');
  const canReturnCancel = c.statut === 'en_validation' && current && (hasRole(current.role_code_requis) || sa);
  const previousSteps = current ? steps.filter(s => s.ordre < current.ordre) : [];

  return (
    <div>
      <CommerceSubnav />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{c.numero || 'Brouillon'} — {c.type_formulaire === 'yaourt' ? 'Yaourt' : 'Divers'}</h2>
          <span className="badge" style={{ background: STATUT_COLOR[c.statut] || '#6b7280', color: '#fff' }}>{STATUT_LABEL[c.statut] || c.statut}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {c.statut === 'valide' && <button className="btn btn-primary" onClick={openPdf}>Télécharger le PDF</button>}
            {c.statut === 'brouillon' && canEdit && <button className="btn" onClick={() => nav(`/commerce/commandes/${id}/edit`)}>Modifier</button>}
            {c.statut === 'brouillon' && canEdit && <button className="btn btn-primary" onClick={submit} disabled={busy}>Soumettre</button>}
            {c.statut === 'brouillon' && canEdit && <button className="btn btn-danger-ghost" onClick={remove} disabled={busy}>Supprimer</button>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16, padding: 14, background: 'var(--color-card, #fff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8 }}>
          <Info l="Bénéficiaire" v={`${benef} (${c.beneficiaire_type})`} />
          <Info l="Véhicule" v={c.vehicle_immatriculation ? `${c.vehicle_immatriculation}${c.vehicle_marque ? ' — ' + c.vehicle_marque : ''}` : '—'} />
          <Info l={`Remplissage (${unite}s)`} v={c.capacite_figee ? `${fmt(totalQ)} / ${fmt(c.capacite_figee)} (${c.taux_remplissage}%)` : `${fmt(totalQ)} — n.d.`} />
          <Info l="Montant total" v={`${fmt(c.montant_total)} GNF`} />
          <Info l="Créé par" v={c.created_by_nom} />
          {c.motif_sous_charge && <Info l="Motif sous-charge" v={c.motif_sous_charge} />}
          {c.motif_annulation && <Info l="Motif annulation" v={c.motif_annulation} />}
        </div>

        {/* Frise du workflow */}
        {steps.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {steps.map(s => {
              const st = stepState(s);
              return (
                <div key={s.id} style={{ flex: '1 1 180px', minWidth: 170, border: `1px solid ${st.color}`, borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Étape {s.ordre}</div>
                  <div style={{ fontWeight: 600 }}>{s.nom}</div>
                  <span className="badge" style={{ background: st.color, color: '#fff', marginTop: 4 }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Contrôle stock en éventail par BU */}
        {(wf?.stock || []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Contrôle stock par BU</h3>
            <div className="table-wrap">
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>BU</th><th>Disponibilité</th><th>Confirmé par</th><th>Commentaire</th>{canStock && <th></th>}</tr></thead>
                <tbody>
                  {wf.stock.map(s => (
                    <tr key={s.business_unit_id}>
                      <td>{s.business_unit_nom || s.business_unit_id}</td>
                      <td>{s.disponible === true ? '✔ Disponible' : s.disponible === false ? '✗ Indisponible' : '⏳ En attente'}</td>
                      <td>{s.confirme_par_nom || '—'}</td>
                      <td>{s.commentaire || '—'}</td>
                      {canStock && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {canConfirmBU(s.business_unit_id) ? (<>
                            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => call('stock-confirm', { business_unit_id: s.business_unit_id, disponible: true })}>Disponible</button>{' '}
                            <button className="btn btn-sm btn-danger-ghost" disabled={busy} onClick={() => { const m = window.prompt('Commentaire (indisponibilité) :') || ''; call('stock-confirm', { business_unit_id: s.business_unit_id, disponible: false, commentaire: m }); }}>Indispo.</button>
                          </>) : <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>— autre BU —</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions de validation */}
        {(canValidateCurrent || canReturnCancel) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {canValidateCurrent && <button className="btn btn-primary" disabled={busy} onClick={() => { const m = window.prompt('Commentaire (facultatif) :') || ''; call('validate', { commentaire: m }); }}>Valider l'étape</button>}
            {canReturnCancel && <button className="btn" disabled={busy} onClick={() => setRetour({ target: 'createur', commentaire: '' })}>Retourner</button>}
            {canReturnCancel && <button className="btn btn-danger-ghost" disabled={busy} onClick={() => { const m = window.prompt("Motif d'annulation (obligatoire) :"); if (m && m.trim()) call('cancel', { motif: m.trim() }); }}>Annuler le bon</button>}
          </div>
        )}

        {/* Panneau de retour */}
        {retour && (
          <div style={{ marginBottom: 16, padding: 14, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, maxWidth: 520 }}>
            <h4 style={{ marginTop: 0 }}>Retour pour complément</h4>
            <label style={{ display: 'block', marginBottom: 8 }}>Renvoyer à
              <select value={retour.target} onChange={e => setRetour({ ...retour, target: e.target.value })} style={{ display: 'block' }}>
                <option value="createur">Créateur (brouillon)</option>
                {previousSteps.map(s => <option key={s.id} value={s.code}>{s.nom}</option>)}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>Motif (obligatoire)
              <textarea value={retour.commentaire} onChange={e => setRetour({ ...retour, commentaire: e.target.value })} style={{ display: 'block', width: '100%' }} rows={2} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setRetour(null)}>Annuler</button>
              <button className="btn btn-primary" disabled={busy || !retour.commentaire.trim()} onClick={() => call('return', { target_step_code: retour.target, commentaire: retour.commentaire.trim() })}>Confirmer le retour</button>
            </div>
          </div>
        )}

        {/* Lignes */}
        <div className="table-wrap">
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Produit</th><th>BU</th><th>Qté ({unite}s)</th><th style={{ textAlign: 'right' }}>Prix unitaire</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
            <tbody>
              {(c.lignes || []).length === 0 ? <tr><td colSpan={5}>Aucune ligne.</td></tr>
                : c.lignes.map(l => (
                  <tr key={l.id}>
                    <td>{l.libelle_fige}</td><td>{l.business_unit_nom || '—'}</td><td>{fmt(l.quantite)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(l.prix_unitaire_fige)} GNF</td>
                    <td style={{ textAlign: 'right' }}>{fmt(l.montant_ligne)} GNF</td>
                  </tr>
                ))}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700 }}><td colSpan={2}>Total</td><td>{fmt(totalQ)} {unite}s</td><td></td><td style={{ textAlign: 'right' }}>{fmt(c.montant_total)} GNF</td></tr></tfoot>
          </table>
        </div>

        {/* Historique */}
        {(wf?.historique || []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Historique</h3>
            <ul style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {wf.historique.map((h, i) => (
                <li key={i}>{(h.created_at || '').slice(0, 16).replace('T', ' ')} — <strong>{h.event_type}</strong>{h.step_code ? ` (${h.step_code})` : ''}{h.acteur_nom ? ` par ${h.acteur_nom}` : ''}{h.commentaire ? ` : ${h.commentaire}` : ''}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
    </div>
  );
}
