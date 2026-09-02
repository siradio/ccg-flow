import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasRoleOnEntity } from '../../auth/AuthContext';
import WorkflowTimeline from '../../components/WorkflowTimeline';
import { StatusBadge } from './statusLabels.jsx';
import { SUPPLIER_FIELDS } from '../Referentials/ReferentialsIndex.jsx';
import { FieldInput, emptyForm } from '../Referentials/ReferentialPage.jsx';
import { useI18n } from '../../i18n/I18nContext';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { CURRENCIES } from '../../config/currencies';

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
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const [pr, setPr] = useState(null);
  const [reopenReason, setReopenReason] = useState('');
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

  // Recharge la demande ET rafraîchit l'historique (clé `version`) — utilisé par les sections qui
  // gèrent elles-mêmes leur retour visuel (ex. ValidationSection).
  const refresh = useCallback(async () => {
    await reload();
    setVersion(v => v + 1);
  }, [reload]);

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
    setTimeout(() => setToast(cur => (cur === message ? null : cur)), 3500);
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
      setError(err.response?.data?.error || t('prd.genericError'));
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

  if (!pr) return <p>{t('prd.loading')}</p>;

  // Le service achat peut ajuster la devise du bon de commande (reprise du devis, modifiable) tant que
  // le BC n'est pas généré (statuts devis_selectionne / en_validation).
  const canEditDevise = hasRoleOnEntity(user, 'service_achat', pr.entity_id) && ['devis_selectionne', 'en_validation'].includes(pr.status);
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
        <h2>{t('prd.workflowTracking')}</h2>
        <WorkflowTimeline pr={pr} steps={steps} />
      </section>

      <section className="card">
        <h2>{t('prd.info')}</h2>
        <p><strong>{t('prc.entity')} :</strong> {pr.entity_nom}</p>
        {pr.entity_code === 'SOGUIPAL' && (
          <p><strong>{t('stockreleve.bu')} :</strong> {pr.business_unit_nom || t('cockpit.allBu')}</p>
        )}
        <p><strong>{t('prd.requester')} :</strong> {pr.requester_prenom} {pr.requester_nom}</p>
        {pr.justification && <p><strong>{t('prc.justification')} :</strong> {pr.justification}</p>}
        <p style={{ marginBottom: 0 }}><strong>{t('prd.finalAmount')} :</strong>{' '}
          {pr.montant_final ? (
            <>
              {pr.montant_final}{' '}
              {canEditDevise ? (
                <select value={pr.devise} style={{ padding: '2px 6px' }}
                  onChange={e => guarded(() => client.put(`/purchase-requests/${pr.id}/devise`, { devise: e.target.value }), t('prd.deviseUpdated'))}>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              ) : pr.devise}
            </>
          ) : '—'}
        </p>
      </section>

      {pr.attachments?.length > 0 && (
        <section className="card">
          <h2>{t('prd.attachments')}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pr.attachments.map(a => (
              <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm"
                  onClick={() => openAuthenticatedFile(`/attachments/${a.id}`)}>
                  {a.filename}
                </button>
                {a.taille != null && (
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {Math.max(1, Math.round(a.taille / 1024))} {t('prd.kb')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <LinesSection pr={pr} products={products} isRequester={isRequester} guarded={guarded} />

      {pr.status === 'brouillon' && isRequester && (
        <section className="card">
          <button className="btn btn-primary" disabled={pr.lines.length === 0}
            onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/submit`), t('prd.submitNeedToast'))}>
            {t('prd.submitNeed')}
          </button>
        </section>
      )}

      <QuoteRequestSection pr={pr} suppliers={suppliers} guarded={guarded} minSuppliers={minSuppliers} addSupplier={addSupplier} entities={entities} />
      <QuotesSection pr={pr} guarded={guarded} suppliers={suppliers} />
      <ValidationSection pr={pr} refresh={refresh} showToast={showToast} />

      {pr.purchase_order && (
        <PurchaseOrderSection po={pr.purchase_order} canSend={hasRoleOnEntity(user, 'service_achat', pr.entity_id)} />
      )}

      {['devis_selectionne', 'en_validation', 'bon_commande_genere'].includes(pr.status) && hasRoleOnEntity(user, 'service_achat', pr.entity_id) && (
        <section className="card">
          <h2>{t('prd.reopenTitle')}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>{t('prd.reopenHint')}</p>
          <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} placeholder={t('prd.reopenReasonPlaceholder')}
            style={{ display: 'block', width: '100%', marginBottom: 10, minHeight: 60 }} />
          <button className="btn btn-secondary" disabled={!reopenReason.trim()} onClick={async () => {
            if (await confirm(t('prd.reopenConfirm'), { danger: true, confirmLabel: t('prd.reopen') })) {
              const ok = await guarded(() => client.post(`/purchase-requests/${pr.id}/reopen-consultation`, { comment: reopenReason.trim() }), t('prd.reopenToast'));
              if (ok) setReopenReason('');
            }
          }}>{t('prd.reopen')}</button>
        </section>
      )}

      <HistorySection key={version} prId={pr.id} />
    </div>
  );
}

function LinesSection({ pr, products, isRequester, guarded }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ productId: '', descriptionLibre: '', quantite: '', unite: '' });
  const editable = pr.status === 'brouillon' && isRequester;
  const showPrices = (pr.lines || []).some(l => l.prix_unitaire_final != null);
  const money = (n) => (Number(n) || 0).toLocaleString('fr-FR');

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
      <h2>{t('prd.lines')}</h2>
      <div className="table-wrap" style={{ marginBottom: editable ? 12 : 0 }}>
        <table>
          <thead><tr>
            <th>{t('prd.designation')}</th><th>{t('prd.quantity')}</th><th>{t('prd.unit')}</th>
            {showPrices && <><th className="num">{t('prd.unitPrice')}</th><th className="num">{t('prd.lineTotal')}</th></>}
            <th>{t('prd.selectedSupplier')}</th>{editable && <th />}
          </tr></thead>
          <tbody>
            {pr.lines.map(l => (
              <tr key={l.id}>
                <td>{l.designation || l.description_libre}</td>
                <td>{l.quantite}</td>
                <td>{l.unite}</td>
                {showPrices && <>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{l.prix_unitaire_final != null ? `${money(l.prix_unitaire_final)} ${pr.devise}` : '—'}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{l.prix_unitaire_final != null ? `${money(Number(l.prix_unitaire_final) * Number(l.quantite))} ${pr.devise}` : '—'}</td>
                </>}
                <td>{l.fournisseur_retenu_id ? '✓' : '—'}</td>
                {editable && (
                  <td>
                    <button className="btn btn-danger btn-sm"
                      onClick={() => guarded(() => client.delete(`/purchase-requests/${pr.id}/lines/${l.id}`))}>
                      {t('common.delete')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {pr.lines.length === 0 && <tr><td className="empty-row" colSpan={(editable ? 5 : 4) + (showPrices ? 2 : 0)}>{t('prd.noLines')}</td></tr>}
          </tbody>
        </table>
      </div>
      {editable && (
        <form onSubmit={addLine} className="form-inline">
          <select value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}>
            <option value="">{t('prd.freeItem')}</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
          </select>
          {!form.productId && (
            <input placeholder={t('prd.description')} value={form.descriptionLibre}
              onChange={e => setForm({ ...form, descriptionLibre: e.target.value })} />
          )}
          <input placeholder={t('prd.quantity')} type="number" required value={form.quantite}
            onChange={e => setForm({ ...form, quantite: e.target.value })} style={{ width: 100 }} />
          <input placeholder={t('prd.unit')} value={form.unite} onChange={e => setForm({ ...form, unite: e.target.value })} style={{ width: 100 }} />
          <button type="submit" className="btn btn-primary">{t('common.add')}</button>
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
  const { t, lang } = useI18n();
  const canAct = hasRoleOnEntity(user, 'service_achat', pr.entity_id);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState(() => defaultNewSupplier(pr.entity_id));
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [sendResults, setSendResults] = useState({}); // { [quoteRequestSupplierId]: { sent, error } }
  const [copiedId, setCopiedId] = useState(null);
  const [emailFor, setEmailFor] = useState({});   // { [qrsId]: email saisi } — quand le fournisseur n'a pas d'email
  const [needEmail, setNeedEmail] = useState({}); // { [qrsId]: true } — afficher le champ de saisie
  const [sendingOne, setSendingOne] = useState(null); // qrsId en cours d'envoi
  // Copie (CC) des e-mails envoyés aux fournisseurs — mémorisée comme préférence de l'utilisateur.
  const [ccSelf, setCcSelf] = useState(() => localStorage.getItem('ccg-flow-devis-cc-self') !== 'false');
  const [ccOthers, setCcOthers] = useState(() => localStorage.getItem('ccg-flow-devis-cc-others') || '');
  function updateCcSelf(v) { setCcSelf(v); localStorage.setItem('ccg-flow-devis-cc-self', v ? 'true' : 'false'); }
  function updateCcOthers(v) { setCcOthers(v); localStorage.setItem('ccg-flow-devis-cc-others', v); }
  function buildCc() {
    return [ccSelf ? user?.email : null, ...ccOthers.split(',')].map(s => (s || '').trim()).filter(Boolean).join(',');
  }

  function copyEmailText(qr, s) {
    const subject = `Demande de devis — ${pr.numero}`;
    const body = qr.message?.trim() || defaultQuoteRequestBody(pr.numero);
    navigator.clipboard.writeText(`Objet : ${subject}\n\n${body}`).then(() => {
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(id => (id === s.id ? null : id)), 2000);
    });
  }

  async function sendQuoteRequestBatch(qrId) {
    const res = await client.post(`/purchase-requests/${pr.id}/quote-requests/${qrId}/send`, { cc: buildCc() });
    setSendResults(r => ({ ...r, ...Object.fromEntries(res.data.map(x => [x.supplierId, x])) }));
  }

  // Envoi ciblé à un fournisseur. S'il n'a pas d'email et qu'aucun n'a été saisi, on affiche le
  // champ de saisie au lieu d'envoyer.
  async function sendToSupplier(s) {
    const email = (emailFor[s.id] || '').trim();
    if (!s.supplier_email && !email) { setNeedEmail(n => ({ ...n, [s.id]: true })); return; }
    setSendingOne(s.id);
    const ok = await guarded(async () => {
      await client.post(`/purchase-requests/${pr.id}/quote-requests/suppliers/${s.id}/send`, { ...(email ? { email } : {}), cc: buildCc() });
      setSendResults(r => ({ ...r, [s.supplier_id]: { sent: true } }));
      setNeedEmail(n => ({ ...n, [s.id]: false }));
    }, t('prd.sentToSupplier', { nom: s.supplier_nom }));
    setSendingOne(null);
    if (!ok) setSendResults(r => ({ ...r, [s.supplier_id]: { sent: false, error: t('prd.sendFailed') } }));
  }

  const canCreate = canAct && ['soumise', 'en_analyse_achat', 'devis_en_cours'].includes(pr.status);

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
      setAddError(err.response?.data?.error || t('prd.addSupplierError'));
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('prd.quoteRequest')}</h2>
      {canCreate && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {t('prd.selectAtLeast', { n: minSuppliers })}
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
              {t('prd.notEnoughSuppliers', { n: suppliers.length, min: minSuppliers })}
            </p>
          )}

          {!showAddSupplier ? (
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAddSupplier(true)}>
              {t('prd.addSupplier')}
            </button>
          ) : (
            <form onSubmit={submitNewSupplier} className="form-inline" style={{ marginTop: 10, padding: 10, background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ width: '100%', fontSize: 13 }}>{t('prd.newSupplierTitle')}</strong>
              {SUPPLIER_FIELDS.map(f => (
                <FieldInput key={f.key} field={f} value={newSupplier[f.key]} onChange={v => setNewSupplier({ ...newSupplier, [f.key]: v })} entities={entities} />
              ))}
              <button type="submit" className="btn btn-primary btn-sm" disabled={adding}>{adding ? '…' : t('common.add')}</button>
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => { setShowAddSupplier(false); setAddError(''); }}>{t('common.cancel')}</button>
              {addError && <div className="alert alert-danger" style={{ width: '100%' }}>{addError}</div>}
            </form>
          )}

          <textarea placeholder={t('prd.messagePlaceholder')} value={message} onChange={e => setMessage(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 8 }} />
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            {t('prd.messageHint')}
          </p>
          <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={selected.length < minSuppliers}
            onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/quote-requests`, { supplierIds: selected, message }), t('prd.launchConsultToast'))}>
            {t('prd.launchConsult')}
          </button>
        </div>
      )}

      {canAct && pr.quote_requests.length > 0 && (
        <div style={{ marginBottom: 12, padding: 10, background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={ccSelf} onChange={e => updateCcSelf(e.target.checked)} />
            {t('prd.ccSelf', { email: user?.email || '' })}
          </label>
          <input value={ccOthers} onChange={e => updateCcOthers(e.target.value)} placeholder={t('prd.ccOthers')}
            style={{ display: 'block', width: '100%', marginTop: 6, fontSize: 13 }} />
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>{t('prd.ccHint')}</p>
        </div>
      )}

      {pr.quote_requests.map(qr => (
        <div key={qr.id} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0' }}>{t('prd.consultOf', { date: new Date(qr.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') })}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {qr.suppliers.map(s => {
              const result = sendResults[s.supplier_id];
              return (
                <li key={s.id} style={{ marginBottom: 4 }}>
                  {s.supplier_nom} — {t('qrstatut.' + s.statut)}
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
                    {copiedId === s.id ? t('prd.copied') : t('prd.copyText')}
                  </button>
                  {canAct && (
                    <>
                      {' '}
                      <button type="button" className="btn btn-primary btn-sm" style={{ padding: '1px 8px', fontSize: 11 }}
                        disabled={sendingOne === s.id}
                        onClick={() => sendToSupplier(s)}>
                        {sendingOne === s.id ? t('prd.sending') : (s.statut === 'envoye' ? t('prd.resendEmail') : t('prd.sendEmail'))}
                      </button>
                      {needEmail[s.id] && (
                        <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6, verticalAlign: 'middle' }}>
                          <input type="email" placeholder={t('prd.supplierEmail')} value={emailFor[s.id] || ''}
                            onChange={e => setEmailFor(f => ({ ...f, [s.id]: e.target.value }))}
                            style={{ fontSize: 12, padding: '2px 6px', width: 190 }} />
                          <button type="button" className="btn btn-primary btn-sm" style={{ padding: '1px 8px', fontSize: 11 }}
                            disabled={sendingOne === s.id || !(emailFor[s.id] || '').trim()}
                            onClick={() => sendToSupplier(s)}>{t('prd.send')}</button>
                        </span>
                      )}
                      {s.statut === 'a_envoyer' && (
                        <>
                          {' '}
                          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '1px 8px', fontSize: 11 }}
                            title={t('prd.markConsultedHint')}
                            onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/quote-requests/suppliers/${s.id}/mark-sent`), t('prd.markConsultedToast'))}>
                            {t('prd.markConsulted')}
                          </button>
                        </>
                      )}
                      {result?.sent === true && <span style={{ color: 'var(--color-success-fg)' }}> — {t('prd.sentOk')}</span>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {canAct && qr.suppliers.some(s => s.statut === 'a_envoyer') && (
            <>
              <button className="btn btn-secondary" style={{ marginTop: 8 }}
                onClick={() => guarded(() => sendQuoteRequestBatch(qr.id), t('prd.sentAllQuotes'))}>
                {t('prd.sendAllQuotes')}
              </button>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
                {t('prd.sendFallbackHint')}
              </p>
            </>
          )}
        </div>
      ))}
    </section>
  );
}

function QuotesSection({ pr, guarded, suppliers = [] }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const canAct = hasRoleOnEntity(user, 'service_achat', pr.entity_id);
  const emptyQuoteForm = { quoteRequestSupplierId: '', devise: 'GNF', notes: '', file: null, prices: {} };
  const [form, setForm] = useState(emptyQuoteForm);

  const sentSuppliers = pr.quote_requests.flatMap(qr => qr.suppliers.filter(s => s.statut !== 'a_envoyer'));
  const withoutQuote = sentSuppliers.filter(s => !pr.quotes.some(q => q.supplier_id === s.supplier_id));
  const canAddQuote = canAct && pr.status === 'devis_en_cours';
  const canSelect = canAct && ['devis_en_cours', 'devis_selectionne'].includes(pr.status);
  const lines = pr.lines || [];

  // Devises proposées : celles déclarées par le fournisseur choisi (référentiel), sinon les 4 par
  // défaut. GNF reste la valeur par défaut de la liste.
  const chosen = withoutQuote.find(s => String(s.id) === String(form.quoteRequestSupplierId));
  const chosenSupplier = chosen && suppliers.find(x => x.id === chosen.supplier_id);
  const deviseOptions = (chosenSupplier?.devises?.length ? chosenSupplier.devises : CURRENCIES.map(c => c.code));

  const quoteTotal = lines.reduce((s, l) => s + (Number(form.prices[l.id]) || 0) * Number(l.quantite || 0), 0);

  if (pr.quotes.length === 0 && withoutQuote.length === 0) return null;

  function submitQuote(e) {
    e.preventDefault();
    const lignes = lines.map(l => ({ lineId: l.id, prixUnitaire: Number(form.prices[l.id]) || 0 }));
    const data = new FormData();
    data.append('quoteRequestSupplierId', form.quoteRequestSupplierId);
    data.append('devise', form.devise || 'GNF');
    data.append('lignes', JSON.stringify(lignes));
    if (form.file) data.append('file', form.file);
    guarded(() => client.post(`/purchase-requests/${pr.id}/quotes`, data, { headers: { 'Content-Type': 'multipart/form-data' } }), t('prd.quoteSavedToast'))
      .then(ok => { if (ok) setForm(emptyQuoteForm); });
  }
  const money = (n) => (Number(n) || 0).toLocaleString('fr-FR');

  return (
    <section className="card">
      <h2>{t('prd.quotesReceived')}</h2>
      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <table>
          <thead><tr><th>{t('prd.supplier')}</th><th>{t('prd.amount')}</th><th>{t('prd.currency')}</th><th>{t('prd.quotePdf')}</th><th>{t('prd.selected')}</th>{canSelect && <th />}</tr></thead>
          <tbody>
            {pr.quotes.map(q => (
              <tr key={q.id}>
                <td>{q.supplier_nom}</td>
                <td>{q.montant}</td>
                <td>{q.devise}</td>
                <td>
                  {q.attachment_id ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openAuthenticatedFile(`/attachments/${q.attachment_id}`)}>
                      {t('prd.view')}
                    </button>
                  ) : '—'}
                </td>
                <td>{q.selectionne ? '✓' : ''}</td>
                {canSelect && !q.selectionne && (
                  <td><button className="btn btn-primary btn-sm"
                    onClick={() => guarded(() => client.post(`/purchase-requests/${pr.id}/quotes/${q.id}/select`), t('prd.quoteSelectedToast'))}>
                    {t('prd.selectBtn')}
                  </button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canAddQuote && withoutQuote.length > 0 && (
        <form onSubmit={submitQuote}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <label className="field" style={{ minWidth: 200 }}>{t('prd.supplier')}
              <select required value={form.quoteRequestSupplierId} onChange={e => { const s = withoutQuote.find(x => String(x.id) === e.target.value); const sup = s && suppliers.find(y => y.id === s.supplier_id); const opts = sup?.devises?.length ? sup.devises : CURRENCIES.map(c => c.code); setForm({ ...form, quoteRequestSupplierId: e.target.value, devise: opts.includes('GNF') ? 'GNF' : opts[0] }); }}>
                <option value="">{t('prd.supplierDots')}</option>
                {withoutQuote.map(s => <option key={s.id} value={s.id}>{s.supplier_nom}</option>)}
              </select>
            </label>
            <label className="field" style={{ minWidth: 130 }}>{t('prd.currency')}
              <select value={form.devise} onChange={e => setForm({ ...form, devise: e.target.value })}>
                {deviseOptions.map(code => { const c = CURRENCIES.find(x => x.code === code); return <option key={code} value={code}>{c ? c.label : code}</option>; })}
              </select>
            </label>
            <label className="field" style={{ minWidth: 220 }}>{t('prd.quoteFileLabel')}
              <input type="file" onChange={e => setForm({ ...form, file: e.target.files[0] })} />
            </label>
          </div>
          {form.quoteRequestSupplierId && (
            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table>
                <thead><tr><th>{t('prd.designation')}</th><th className="num">{t('prd.quantity')}</th><th className="num">{t('prd.unitPrice')}</th><th className="num">{t('prd.lineTotal')}</th></tr></thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id}>
                      <td>{l.designation || l.description_libre}</td>
                      <td className="num">{l.quantite} {l.unite || ''}</td>
                      <td className="num">
                        <input type="number" min="0" step="0.01" style={{ width: 130, textAlign: 'right' }}
                          value={form.prices[l.id] ?? ''} onChange={e => setForm(f => ({ ...f, prices: { ...f.prices, [l.id]: e.target.value } }))} />
                      </td>
                      <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{money((Number(form.prices[l.id]) || 0) * Number(l.quantite || 0))} {form.devise}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3} style={{ fontWeight: 700, textAlign: 'right' }}>{t('prd.quoteTotal')}</td><td className="num" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(quoteTotal)} {form.devise}</td></tr></tfoot>
              </table>
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={!form.quoteRequestSupplierId || quoteTotal <= 0}>{t('prd.saveQuote')}</button>
        </form>
      )}
    </section>
  );
}

function PurchaseOrderSection({ po, canSend }) {
  const { t } = useI18n();
  const [sending, setSending] = useState(false);
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null); // { ok, message }

  async function send() {
    const e = email.trim();
    setSending(true);
    setResult(null);
    try {
      const res = await client.post(`/purchase-orders/${po.id}/send`, e ? { email: e } : {});
      setResult({ ok: true, message: t('prd.poSentTo', { to: res.data.to }) });
      setNeedEmail(false);
    } catch (err) {
      // 400 = le fournisseur n'a pas d'email : on propose la saisie.
      if (err.response?.status === 400) setNeedEmail(true);
      setResult({ ok: false, message: err.response?.data?.error || t('prd.sendFailed') });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('prd.po')}</h2>
      <p><strong>{po.numero}</strong> — {po.montant} {po.devise}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={() => openAuthenticatedFile(`/purchase-orders/${po.id}/pdf`)}>
          {t('prd.viewPdf')}
        </button>
        {canSend && (
          <button className="btn btn-primary" disabled={sending} onClick={send}>
            {sending ? t('prd.sending') : t('prd.sendToSupplier')}
          </button>
        )}
      </div>
      {needEmail && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="email" placeholder={t('prd.supplierEmail')} value={email} onChange={e => setEmail(e.target.value)}
            style={{ flex: '1 1 240px', maxWidth: 320 }} />
          <button className="btn btn-primary btn-sm" disabled={sending || !email.trim()} onClick={send}>{t('prd.send')}</button>
        </div>
      )}
      {result && (
        <div className={`alert ${result.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: 12, marginBottom: 0 }}>
          {result.message}
        </div>
      )}
    </section>
  );
}

function ValidationSection({ pr, refresh, showToast }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(null); // 'validate' | 'reject' | null — désactive les boutons pendant l'appel
  const [msg, setMsg] = useState(null);   // { type: 'success' | 'error', text } — retour affiché SOUS les boutons

  // Le rôle requis vient de la configuration réelle de l'étape (pr.current_step_role, renvoyée par
  // l'API), jamais d'une copie figée côté front — sinon éditer le workflow n'aurait aucun effet visible ici.
  let requiredRole = null;
  if (pr.status === 'en_attente_validation_besoin') requiredRole = 'validateur_besoin';
  else if (pr.status === 'devis_selectionne') requiredRole = 'service_achat';
  else if (pr.status === 'en_validation') requiredRole = pr.current_step_role;
  else if (pr.status === 'en_validation_dga') requiredRole = 'validateur_besoin';

  if (!requiredRole || !hasRoleOnEntity(user, requiredRole, pr.entity_id)) return null;
  const canReject = pr.status === 'en_validation' || pr.status === 'en_attente_validation_besoin' || pr.status === 'en_validation_dga';

  // Retour visuel géré localement (près des boutons) + anti double-clic : tant qu'un appel est en
  // cours, les boutons sont désactivés, ce qui évite les clics répétés et les erreurs en cascade.
  async function act(kind) {
    if (busy) return;
    const path = kind === 'reject' ? 'reject-step' : 'validate-step';
    const successText = kind === 'reject' ? t('prd.requestRejected') : t('prd.stepValidated');
    setBusy(kind);
    setMsg(null);
    try {
      await client.post(`/purchase-requests/${pr.id}/${path}`, { comment });
      setMsg({ type: 'success', text: successText });
      showToast(successText);
      await refresh(); // le statut avance : cette section peut alors disparaître (ce n'est plus notre tour)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || t('prd.genericError') });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <h2>{t('prd.validation')}</h2>
      {canReject && (
        <textarea placeholder={t('prd.commentPlaceholder')} value={comment} onChange={e => setComment(e.target.value)}
          disabled={!!busy}
          style={{ display: 'block', width: '100%', marginBottom: 10 }} />
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!!busy} onClick={() => act('validate')}>
          {busy === 'validate' ? t('prd.validating') : t('prd.validate')}
        </button>
        {canReject && (
          <button className="btn btn-danger" disabled={!!busy} onClick={() => act('reject')}>
            {busy === 'reject' ? t('prd.rejecting') : t('prd.reject')}
          </button>
        )}
      </div>
      {msg && (
        <div className={`alert ${msg.type === 'success' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: 12, marginBottom: 0 }}>
          {msg.text}
        </div>
      )}
    </section>
  );
}

function HistorySection({ prId }) {
  const { t, lang } = useI18n();
  const [history, setHistory] = useState([]);
  useEffect(() => { client.get(`/purchase-requests/${prId}/history`).then(res => setHistory(res.data)); }, [prId]);

  return (
    <section className="card">
      <h2>{t('prd.history')}</h2>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {history.map(h => (
          <li key={h.id} style={{ fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{new Date(h.created_at).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}</span>
            {' — '}<strong>{h.action}</strong>
            {h.user_nom && ` ${t('prd.by')} ${h.user_prenom} ${h.user_nom}`}
            {h.details?.commentaire && ` : "${h.details.commentaire}"`}
          </li>
        ))}
        {history.length === 0 && <li className="empty-row" style={{ listStyle: 'none', marginLeft: -18 }}>{t('prd.noHistory')}</li>}
      </ul>
    </section>
  );
}
