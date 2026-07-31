import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasRoleOnEntity } from '../../auth/AuthContext';
import WorkflowTimeline from '../../components/WorkflowTimeline';
import { StatusBadge } from './statusLabels.jsx';
import { SUPPLIER_FIELDS } from '../Referentials/ReferentialsIndex.jsx';
import { FieldInput, emptyForm } from '../Referentials/ReferentialPage.jsx';

// Les téléchargements passent par l'API JWT : un <a href> direct n'enverrait pas le header
// d'autorisation, d'où un fetch authentifié suivi de l'ouverture d'une blob URL.
async function openAuthenticatedFile(path) {
  const res = await client.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  window.open(url, '_blank');
}

export default function DetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [pr, setPr] = useState(null);
  const [steps, setSteps] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [entities, setEntities] = useState([]);
  const [minSuppliers, setMinSuppliers] = useState(2);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState(null);

  const reload = useCallback(() => {
    return client.get(`/purchase-requests/${id}`).then(res => setPr(res.data));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    client.get('/settings').then(res => setMinSuppliers(Number(res.data.min_suppliers_devis) || 1));
    client.get('/entities').then(res => setEntities(res.data));
  }, []);
  useEffect(() => {
    if (!pr) return;
    client.get('/products', { params: { entity_id: pr.entity_id } }).then(res => setProducts(res.data));
    client.get('/suppliers', { params: { entity_id: pr.entity_id } }).then(res => setSuppliers(res.data));
  }, [pr?.entity_id]);
  // Le circuit affiché est celui réellement suivi par CETTE demande (workflow_template_id), pas
  // forcément le circuit actif aujourd'hui — une demande en cours doit continuer à afficher son
  // propre circuit même après qu'une étape a été supprimée et versionnée pour les nouvelles (§3.2).
  useEffect(() => {
    if (!pr) return;
    client.get(`/workflows/by-id/${pr.workflow_template_id}`).then(res => setSteps(res.data.steps));
  }, [pr?.workflow_template_id]);

  // Confirmation visible immédiatement, peu importe où sur la page l'action a été déclenchée — le
  // statut change dans l'en-tête tout en haut, ce qui n'est pas visible sans remonter la page si on
  // vient de cliquer un bouton de validation plus bas (ex. ValidationSection, QuotesSection).
  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(t => (t === message ? null : t)), 3500);
  }

  // Retourne true/false selon le résultat — les appelants qui enchaînent une remise à zéro de
  // formulaire après l'appel (ex. QuotesSection, LinesSection) doivent le faire seulement si ok,
  // sinon un échec (ex. "montant requis") effacerait silencieusement ce que l'utilisateur a saisi.
  async function guarded(action, successMessage) {
    setError('');
    try {
      await action();
      await reload();
      setVersion(v => v + 1);
      if (successMessage) showToast(successMessage);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue.');
      return false;
    }
  }

  // Le service achat peut créer un fournisseur à la volée pendant le traitement de la demande
  // (voir QuoteRequestSection) — ajouté directement à la liste locale, pas de rechargement complet.
  async function addSupplier(fields) {
    const res = await client.post(`/purchase-requests/${pr.id}/quick-supplier`, fields);
    setSuppliers(s => [...s, res.data]);
    return res.data;
  }

  if (!pr) return <p>Chargement…</p>;
  const isRequester = pr.requester_user_id === user.id;

  return (
    <div>
      {toast && (
        <div className="alert alert-success" style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          {toast}
        </div>
      )}
      <div className="page-header">
        <div>
          <h1 className="page-title">{pr.numero}</h1>
          <p className="page-subtitle">{pr.objet}</p>
        </div>
        <StatusBadge status={pr.status} />
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <section className="card">
        <h2>Suivi du workflow</h2>
        <WorkflowTimeline pr={pr} steps={steps} />
      </section>

      <section className="card">
        <h2>Informations</h2>
        <p><strong>Entité :</strong> {pr.entity_nom}</p>
        <p><strong>Demandeur :</strong> {pr.requester_prenom} {pr.requester_nom}</p>
        {pr.justification && <p><strong>Justification :</strong> {pr.justification}</p>}
        <p style={{ marginBottom: 0 }}><strong>Montant final :</strong> {pr.montant_final ? `${pr.montant_final} ${pr.devise}` : '—'}</p>
      </section>

      <LinesSection pr={pr} products={products} isRequester={isRequester} guarded={guarded} />

      {pr.status === 'brouillon' && isRequester && (
        <section className="card">
          <button className="btn btn-primary" disabled={pr.lines.length === 0}
            onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/submit`), "Demande soumise à la DGA pour validation de l'expression de besoin.")}>
            Soumettre l'expression de besoin
          </button>
        </section>
      )}

      <QuoteRequestSection pr={pr} suppliers={suppliers} guarded={guarded} minSuppliers={minSuppliers} addSupplier={addSupplier} entities={entities} />
      <QuotesSection pr={pr} guarded={guarded} />
      <ValidationSection pr={pr} guarded={guarded} />

      {pr.purchase_order && (
        <section className="card">
          <h2>Bon de commande</h2>
          <p><strong>{pr.purchase_order.numero}</strong> — {pr.purchase_order.montant} {pr.purchase_order.devise}</p>
          <button className="btn btn-secondary" onClick={() => openAuthenticatedFile(`/purchase-orders/${pr.purchase_order.id}/pdf`)}>
            Voir le PDF
          </button>
        </section>
      )}

      <HistorySection key={version} prId={pr.id} />
    </div>
  );
}

function LinesSection({ pr, products, isRequester, guarded }) {
  const [form, setForm] = useState({ productId: '', descriptionLibre: '', quantite: '', unite: '' });
  const editable = pr.status === 'brouillon' && isRequester;

  async function addLine(e) {
    e.preventDefault();
    const ok = await guarded(() => client.post(`/purchase-requests/${pr.id}/lines`, {
      productId: form.productId || null, descriptionLibre: form.descriptionLibre || null,
      quantite: Number(form.quantite), unite: form.unite,
    }));
    if (ok) setForm({ productId: '', descriptionLibre: '', quantite: '', unite: '' });
  }

  return (
    <section className="card">
      <h2>Lignes</h2>
      <div className="table-wrap" style={{ marginBottom: editable ? 12 : 0 }}>
        <table>
          <thead><tr>
            <th>Désignation</th><th>Quantité</th><th>Unité</th><th>Fournisseur retenu</th>{editable && <th />}
          </tr></thead>
          <tbody>
            {pr.lines.map(l => (
              <tr key={l.id}>
                <td>{l.designation || l.description_libre}</td>
                <td>{l.quantite}</td>
                <td>{l.unite}</td>
                <td>{l.fournisseur_retenu_id ? '✓' : '—'}</td>
                {editable && (
                  <td>
                    <button className="btn btn-danger btn-sm"
                      onClick={() => guarded(() => client.delete(`/purchase-requests/${pr.id}/lines/${l.id}`))}>
                      Supprimer
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {pr.lines.length === 0 && <tr><td className="empty-row" colSpan={editable ? 5 : 4}>Aucune ligne.</td></tr>}
          </tbody>
        </table>
      </div>
      {editable && (
        <form onSubmit={addLine} className="form-inline">
          <select value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}>
            <option value="">Article libre…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
          </select>
          {!form.productId && (
            <input placeholder="Description" value={form.descriptionLibre}
              onChange={e => setForm({ ...form, descriptionLibre: e.target.value })} />
          )}
          <input placeholder="Quantité" type="number" required value={form.quantite}
            onChange={e => setForm({ ...form, quantite: e.target.value })} style={{ width: 100 }} />
          <input placeholder="Unité" value={form.unite} onChange={e => setForm({ ...form, unite: e.target.value })} style={{ width: 100 }} />
          <button type="submit" className="btn btn-primary">Ajouter</button>
        </form>
      )}
    </section>
  );
}

// Formulaire d'ajout rapide de fournisseur pré-rempli avec l'entité de la demande déjà cochée —
// modifiable comme n'importe quel autre champ, ce n'est qu'une valeur de départ pratique.
function defaultNewSupplier(entityId) {
  return { ...emptyForm(SUPPLIER_FIELDS), entity_ids: [entityId] };
}

// Même texte par défaut que sendQuoteRequest() côté serveur (purchase-requests.service.js) — pour
// que "Copier le texte" affiche toujours exactement ce qui serait/a été réellement envoyé.
function defaultQuoteRequestBody(numero) {
  return `Bonjour,\n\nVeuillez trouver ci-joint notre demande de devis ${numero}.\n\nCordialement.`;
}

function QuoteRequestSection({ pr, suppliers, guarded, minSuppliers, addSupplier, entities }) {
  const { user } = useAuth();
  const canAct = hasRoleOnEntity(user, 'service_achat', pr.entity_id);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState(() => defaultNewSupplier(pr.entity_id));
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [sendResults, setSendResults] = useState({}); // { [quoteRequestSupplierId]: { sent, error } }
  const [copiedId, setCopiedId] = useState(null);

  function copyEmailText(qr, s) {
    const subject = `Demande de devis — ${pr.numero}`;
    const body = qr.message?.trim() || defaultQuoteRequestBody(pr.numero);
    navigator.clipboard.writeText(`Objet : ${subject}\n\n${body}`).then(() => {
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(id => (id === s.id ? null : id)), 2000);
    });
  }

  async function sendQuoteRequestBatch(qrId) {
    const res = await client.post(`/purchase-requests/${pr.id}/quote-requests/${qrId}/send`);
    setSendResults(r => ({ ...r, ...Object.fromEntries(res.data.map(x => [x.supplierId, x])) }));
  }

  const canCreate = canAct && ['soumise', 'en_analyse_achat'].includes(pr.status);

  if (!canAct && pr.quote_requests.length === 0) return null;

  async function submitNewSupplier(e) {
    e.preventDefault();
    if (!newSupplier.nom?.trim()) return;
    setAddError('');
    setAdding(true);
    try {
      const created = await addSupplier(newSupplier);
      setSelected(sel => [...sel, created.id]);
      setNewSupplier(defaultNewSupplier(pr.entity_id));
      setShowAddSupplier(false);
    } catch (err) {
      setAddError(err.response?.data?.error || "Erreur lors de l'ajout du fournisseur.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="card">
      <h2>Demande de devis</h2>
      {canCreate && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Sélectionnez au moins {minSuppliers} fournisseur{minSuppliers > 1 ? 's' : ''} à consulter :
          </p>
          {suppliers.map(s => (
            <label key={s.id} style={{ display: 'block', fontSize: 14, marginBottom: 2 }}>
              <input type="checkbox" checked={selected.includes(s.id)}
                onChange={e => setSelected(e.target.checked ? [...selected, s.id] : selected.filter(id => id !== s.id))} />
              {' '}{s.nom}
            </label>
          ))}
          {suppliers.length < minSuppliers && (
            <p className="alert alert-danger" style={{ marginTop: 8 }}>
              Cette entité n'a que {suppliers.length} fournisseur(s) référencé(s), il en faut au moins {minSuppliers}.
              Ajoutez-en un ci-dessous, via Référentiels → Fournisseurs, ou baissez le seuil dans Workflow → Paramètres.
            </p>
          )}

          {!showAddSupplier ? (
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAddSupplier(true)}>
              + Ajouter un fournisseur
            </button>
          ) : (
            <form onSubmit={submitNewSupplier} className="form-inline" style={{ marginTop: 10, padding: 10, background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ width: '100%', fontSize: 13 }}>Nouveau fournisseur — mêmes champs que le référentiel</strong>
              {SUPPLIER_FIELDS.map(f => (
                <FieldInput key={f.key} field={f} value={newSupplier[f.key]} onChange={v => setNewSupplier({ ...newSupplier, [f.key]: v })} entities={entities} />
              ))}
              <button type="submit" className="btn btn-primary btn-sm" disabled={adding}>{adding ? '…' : 'Ajouter'}</button>
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => { setShowAddSupplier(false); setAddError(''); }}>Annuler</button>
              {addError && <div className="alert alert-danger" style={{ width: '100%' }}>{addError}</div>}
            </form>
          )}

          <textarea placeholder="Message aux fournisseurs (laisser vide pour le texte par défaut)" value={message} onChange={e => setMessage(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 8 }} />
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Ce texte sera le corps de l'email envoyé (et celui proposé au "copier" ci-dessous) — modifiable jusqu'à l'envoi.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={selected.length < minSuppliers}
            onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/quote-requests`, { supplierIds: selected, message }), 'Consultation lancée auprès des fournisseurs sélectionnés.')}>
            Lancer la consultation
          </button>
        </div>
      )}

      {pr.quote_requests.map(qr => (
        <div key={qr.id} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0' }}>Consultation du {new Date(qr.created_at).toLocaleDateString('fr-FR')}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {qr.suppliers.map(s => {
              const result = sendResults[s.supplier_id];
              return (
                <li key={s.id} style={{ marginBottom: 4 }}>
                  {s.supplier_nom} — {s.statut}
                  {result?.sent === false && (
                    <span style={{ color: 'var(--color-danger)' }}> — {result.error}</span>
                  )}
                  {' '}
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '1px 8px', fontSize: 11 }}
                    onClick={() => openAuthenticatedFile(`/purchase-requests/${pr.id}/quote-requests/suppliers/${s.id}/pdf`)}>
                    PDF
                  </button>
                  {' '}
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '1px 8px', fontSize: 11 }}
                    onClick={() => copyEmailText(qr, s)}>
                    {copiedId === s.id ? 'Copié ✓' : 'Copier le texte'}
                  </button>
                </li>
              );
            })}
          </ul>
          {canAct && qr.suppliers.some(s => s.statut === 'a_envoyer') && (
            <>
              <button className="btn btn-secondary" style={{ marginTop: 8 }}
                onClick={() => guarded(() => sendQuoteRequestBatch(qr.id), 'Demandes de devis envoyées.')}>
                Envoyer les demandes de devis
              </button>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
                Si l'envoi échoue (ex. messagerie indisponible), utilisez "PDF" + "Copier le texte" pour l'envoyer vous-même depuis votre propre messagerie.
              </p>
            </>
          )}
        </div>
      ))}
    </section>
  );
}

function QuotesSection({ pr, guarded }) {
  const { user } = useAuth();
  const canAct = hasRoleOnEntity(user, 'service_achat', pr.entity_id);
  const [form, setForm] = useState({ quoteRequestSupplierId: '', montant: '', notes: '', file: null });

  const sentSuppliers = pr.quote_requests.flatMap(qr => qr.suppliers.filter(s => s.statut !== 'a_envoyer'));
  const withoutQuote = sentSuppliers.filter(s => !pr.quotes.some(q => q.supplier_id === s.supplier_id));
  const canAddQuote = canAct && pr.status === 'devis_en_cours';
  const canSelect = canAct && ['devis_en_cours', 'devis_selectionne'].includes(pr.status);

  if (pr.quotes.length === 0 && withoutQuote.length === 0) return null;

  function submitQuote(e) {
    e.preventDefault();
    const data = new FormData();
    data.append('quoteRequestSupplierId', form.quoteRequestSupplierId);
    data.append('montant', form.montant);
    data.append('devise', pr.devise);
    if (form.file) data.append('file', form.file);
    guarded(() => client.post(`/purchase-requests/${pr.id}/quotes`, data, { headers: { 'Content-Type': 'multipart/form-data' } }), 'Devis enregistré.')
      .then(ok => { if (ok) setForm({ quoteRequestSupplierId: '', montant: '', notes: '', file: null }); });
  }

  return (
    <section className="card">
      <h2>Devis reçus</h2>
      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <table>
          <thead><tr><th>Fournisseur</th><th>Montant</th><th>Devise</th><th>Devis (PDF)</th><th>Retenu</th>{canSelect && <th />}</tr></thead>
          <tbody>
            {pr.quotes.map(q => (
              <tr key={q.id}>
                <td>{q.supplier_nom}</td>
                <td>{q.montant}</td>
                <td>{q.devise}</td>
                <td>
                  {q.attachment_id ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openAuthenticatedFile(`/attachments/${q.attachment_id}`)}>
                      Voir
                    </button>
                  ) : '—'}
                </td>
                <td>{q.selectionne ? '✓' : ''}</td>
                {canSelect && !q.selectionne && (
                  <td><button className="btn btn-primary btn-sm"
                    onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/quotes/${q.id}/select`), 'Devis retenu comme offre sélectionnée.')}>
                    Sélectionner
                  </button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canAddQuote && withoutQuote.length > 0 && (
        <form onSubmit={submitQuote} className="form-inline">
          <select required value={form.quoteRequestSupplierId} onChange={e => setForm({ ...form, quoteRequestSupplierId: e.target.value })}>
            <option value="">Fournisseur…</option>
            {withoutQuote.map(s => <option key={s.id} value={s.id}>{s.supplier_nom}</option>)}
          </select>
          <input placeholder="Montant" type="number" required value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} style={{ width: 140 }} />
          <label className="field" style={{ minWidth: 220 }}>
            Devis du fournisseur (PDF, optionnel)
            <input type="file" onChange={e => setForm({ ...form, file: e.target.files[0] })} />
          </label>
          <button type="submit" className="btn btn-primary">Enregistrer le devis</button>
        </form>
      )}
    </section>
  );
}

function ValidationSection({ pr, guarded }) {
  const { user } = useAuth();
  const [comment, setComment] = useState('');

  // Le rôle requis vient de la configuration réelle de l'étape (pr.current_step_role, renvoyée par
  // l'API), jamais d'une copie figée côté front — sinon éditer le workflow n'aurait aucun effet visible ici.
  let requiredRole = null;
  if (pr.status === 'en_attente_validation_besoin') requiredRole = 'dga';
  else if (pr.status === 'devis_selectionne') requiredRole = 'service_achat';
  else if (pr.status === 'en_validation') requiredRole = pr.current_step_role;

  if (!requiredRole || !hasRoleOnEntity(user, requiredRole, pr.entity_id)) return null;
  const canReject = pr.status === 'en_validation' || pr.status === 'en_attente_validation_besoin';

  return (
    <section className="card">
      <h2>Validation</h2>
      {canReject && (
        <textarea placeholder="Commentaire (obligatoire en cas de refus)" value={comment} onChange={e => setComment(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: 10 }} />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/validate-step`, { comment }), 'Étape validée.')}>
          Valider
        </button>
        {canReject && (
          <button className="btn btn-danger" onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/reject-step`, { comment }), 'Demande refusée.')}>
            Refuser
          </button>
        )}
      </div>
    </section>
  );
}

function HistorySection({ prId }) {
  const [history, setHistory] = useState([]);
  useEffect(() => { client.get(`/purchase-requests/${prId}/history`).then(res => setHistory(res.data)); }, [prId]);

  return (
    <section className="card">
      <h2>Historique</h2>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {history.map(h => (
          <li key={h.id} style={{ fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{new Date(h.created_at).toLocaleString('fr-FR')}</span>
            {' — '}<strong>{h.action}</strong>
            {h.user_nom && ` par ${h.user_prenom} ${h.user_nom}`}
            {h.details?.commentaire && ` : "${h.details.commentaire}"`}
          </li>
        ))}
        {history.length === 0 && <li className="empty-row" style={{ listStyle: 'none', marginLeft: -18 }}>Aucun historique.</li>}
      </ul>
    </section>
  );
}
