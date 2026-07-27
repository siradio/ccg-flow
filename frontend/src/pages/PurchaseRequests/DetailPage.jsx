import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasRoleOnEntity } from '../../auth/AuthContext';
import WorkflowTimeline from '../../components/WorkflowTimeline';
import { StatusBadge } from './statusLabels.jsx';

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
  const [minSuppliers, setMinSuppliers] = useState(2);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => {
    return client.get(`/purchase-requests/${id}`).then(res => setPr(res.data));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    client.get('/workflows/demande_achat').then(res => setSteps(res.data.steps));
    client.get('/settings').then(res => setMinSuppliers(Number(res.data.min_suppliers_devis) || 1));
  }, []);
  useEffect(() => {
    if (!pr) return;
    client.get('/products', { params: { entity_id: pr.entity_id } }).then(res => setProducts(res.data));
    client.get('/suppliers', { params: { entity_id: pr.entity_id } }).then(res => setSuppliers(res.data));
  }, [pr?.entity_id]);

  async function guarded(action) {
    setError('');
    try { await action(); await reload(); setVersion(v => v + 1); }
    catch (err) { setError(err.response?.data?.error || 'Une erreur est survenue.'); }
  }

  if (!pr) return <p>Chargement…</p>;
  const isRequester = pr.requester_user_id === user.id;

  return (
    <div>
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
            onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/submit`))}>
            Soumettre l'expression de besoin
          </button>
        </section>
      )}

      <QuoteRequestSection pr={pr} suppliers={suppliers} guarded={guarded} minSuppliers={minSuppliers} />
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

      <AttachmentsSection pr={pr} guarded={guarded} />
      <HistorySection key={version} prId={pr.id} />
    </div>
  );
}

function LinesSection({ pr, products, isRequester, guarded }) {
  const [form, setForm] = useState({ productId: '', descriptionLibre: '', quantite: '', unite: '' });
  const editable = pr.status === 'brouillon' && isRequester;

  async function addLine(e) {
    e.preventDefault();
    await guarded(() => client.post(`/purchase-requests/${pr.id}/lines`, {
      productId: form.productId || null, descriptionLibre: form.descriptionLibre || null,
      quantite: Number(form.quantite), unite: form.unite,
    }));
    setForm({ productId: '', descriptionLibre: '', quantite: '', unite: '' });
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

function QuoteRequestSection({ pr, suppliers, guarded, minSuppliers }) {
  const { user } = useAuth();
  const canAct = hasRoleOnEntity(user, 'service_achat', pr.entity_id);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');

  const canCreate = canAct && ['soumise', 'en_analyse_achat'].includes(pr.status);

  if (!canAct && pr.quote_requests.length === 0) return null;

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
              Ajoutez-en via Référentiels → Fournisseurs, ou baissez le seuil dans Workflow → Paramètres.
            </p>
          )}
          <textarea placeholder="Message aux fournisseurs" value={message} onChange={e => setMessage(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 8 }} />
          <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={selected.length < minSuppliers}
            onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/quote-requests`, { supplierIds: selected, message }))}>
            Lancer la consultation
          </button>
        </div>
      )}

      {pr.quote_requests.map(qr => (
        <div key={qr.id} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0' }}>Consultation du {new Date(qr.created_at).toLocaleDateString('fr-FR')}</p>
          <ul style={{ margin: 0 }}>
            {qr.suppliers.map(s => (
              <li key={s.id}>{s.supplier_nom} — {s.statut}</li>
            ))}
          </ul>
          {canAct && qr.suppliers.some(s => s.statut === 'a_envoyer') && (
            <button className="btn btn-secondary" style={{ marginTop: 8 }}
              onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/quote-requests/${qr.id}/send`))}>
              Envoyer les demandes de devis
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function QuotesSection({ pr, guarded }) {
  const { user } = useAuth();
  const canAct = hasRoleOnEntity(user, 'service_achat', pr.entity_id);
  const [form, setForm] = useState({ quoteRequestSupplierId: '', montant: '', notes: '' });

  const sentSuppliers = pr.quote_requests.flatMap(qr => qr.suppliers.filter(s => s.statut !== 'a_envoyer'));
  const withoutQuote = sentSuppliers.filter(s => !pr.quotes.some(q => q.supplier_id === s.supplier_id));
  const canAddQuote = canAct && pr.status === 'devis_en_cours';
  const canSelect = canAct && ['devis_en_cours', 'devis_selectionne'].includes(pr.status);

  if (pr.quotes.length === 0 && withoutQuote.length === 0) return null;

  return (
    <section className="card">
      <h2>Devis reçus</h2>
      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <table>
          <thead><tr><th>Fournisseur</th><th>Montant</th><th>Devise</th><th>Retenu</th>{canSelect && <th />}</tr></thead>
          <tbody>
            {pr.quotes.map(q => (
              <tr key={q.id}>
                <td>{q.supplier_nom}</td>
                <td>{q.montant}</td>
                <td>{q.devise}</td>
                <td>{q.selectionne ? '✓' : ''}</td>
                {canSelect && !q.selectionne && (
                  <td><button className="btn btn-primary btn-sm"
                    onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/quotes/${q.id}/select`))}>
                    Sélectionner
                  </button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canAddQuote && withoutQuote.length > 0 && (
        <form onSubmit={e => {
          e.preventDefault();
          guarded(() => client.post(`/purchase-requests/${pr.id}/quotes`, {
            quoteRequestSupplierId: Number(form.quoteRequestSupplierId), montant: Number(form.montant), devise: pr.devise, notes: form.notes,
          })).then(() => setForm({ quoteRequestSupplierId: '', montant: '', notes: '' }));
        }} className="form-inline">
          <select required value={form.quoteRequestSupplierId} onChange={e => setForm({ ...form, quoteRequestSupplierId: e.target.value })}>
            <option value="">Fournisseur…</option>
            {withoutQuote.map(s => <option key={s.id} value={s.id}>{s.supplier_nom}</option>)}
          </select>
          <input placeholder="Montant" type="number" required value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} style={{ width: 140 }} />
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
        <button className="btn btn-primary" onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/validate-step`, { comment }))}>
          Valider
        </button>
        {canReject && (
          <button className="btn btn-danger" onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/reject-step`, { comment }))}>
            Refuser
          </button>
        )}
      </div>
    </section>
  );
}

function AttachmentsSection({ pr, guarded }) {
  const [file, setFile] = useState(null);

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    await guarded(() => client.post(`/purchase-requests/${pr.id}/attachments`, data, { headers: { 'Content-Type': 'multipart/form-data' } }));
    setFile(null);
  }

  return (
    <section className="card">
      <h2>Pièces jointes</h2>
      <ul style={{ paddingLeft: 0, listStyle: 'none', margin: '0 0 12px' }}>
        {pr.attachments.map(a => (
          <li key={a.id} style={{ marginBottom: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => openAuthenticatedFile(`/attachments/${a.id}`)}>
              {a.filename}
            </button>
            {' '}<span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>({Math.round(a.taille / 1024)} Ko)</span>
          </li>
        ))}
        {pr.attachments.length === 0 && <li className="empty-row">Aucune pièce jointe.</li>}
      </ul>
      <form onSubmit={upload} className="form-inline">
        <input type="file" onChange={e => setFile(e.target.files[0])} />
        <button type="submit" className="btn btn-secondary" disabled={!file}>Téléverser</button>
      </form>
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
