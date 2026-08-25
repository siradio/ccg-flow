import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';

// Saisie rapide d'un versement commercial. Un montant par moyen de versement (modèle normalisé).
// La BU est récupérée du commercial. Le total est calculé automatiquement. Les boutons s'adaptent
// au paramétrage du workflow (Enregistrer brouillon / Soumettre si activé, sinon Enregistrer).
const money = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' GNF';
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function VersementForm() {
  const { id } = useParams();
  const editing = !!id;
  const { user } = useAuth();
  const navigate = useNavigate();

  const [commerciaux, setCommerciaux] = useState([]);
  const [methods, setMethods] = useState([]);
  const [banks, setBanks] = useState([]);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState([]);

  const [form, setForm] = useState({ commercial_id: '', product_id: '', payment_date: todayISO(), reference_generale: '', commentaire: '' });
  const [amounts, setAmounts] = useState({});       // { [methodId]: montant }
  const [bankRows, setBankRows] = useState({});      // { [methodId]: { bank_id, transaction_reference, transaction_date } }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client.get('/commerce/commerciaux').then(r => setCommerciaux(r.data)).catch(() => {});
    client.get('/commerce/payment-methods').then(r => setMethods(r.data.filter(m => m.actif))).catch(() => {});
    client.get('/commerce/banks').then(r => setBanks(r.data.filter(b => b.actif))).catch(() => {});
    client.get('/products').then(r => setProducts(r.data)).catch(() => {});
    client.get('/commerce/settings').then(r => setSettings(r.data)).catch(() => {});
    if (editing) {
      client.get(`/commerce/versements/${id}`).then(r => {
        const v = r.data;
        setForm({ commercial_id: v.commercial_id, product_id: v.product_id || '', payment_date: v.payment_date?.slice(0, 10) || todayISO(), reference_generale: v.reference_generale || '', commentaire: v.commentaire || '' });
        const a = {}; const br = {};
        for (const l of v.lines) { a[l.payment_method_id] = l.amount; if (l.bank_id || l.transaction_reference) br[l.payment_method_id] = { bank_id: l.bank_id || '', transaction_reference: l.transaction_reference || '', transaction_date: l.transaction_date?.slice(0, 10) || '' }; }
        setAmounts(a); setBankRows(br);
      }).catch(() => setError('Versement introuvable.'));
    }
  }, [id, editing]);

  const commercial = useMemo(() => commerciaux.find(c => String(c.id) === String(form.commercial_id)), [commerciaux, form.commercial_id]);
  const buId = commercial?.business_unit_id || null;

  // Workflow actif pour la BU du commercial (surcharge BU sinon global).
  const workflowActif = useMemo(() => {
    const bu = settings.find(s => Number(s.business_unit_id) === Number(buId) && s.cle === 'workflow_actif');
    if (bu) return bu.valeur === 'true';
    const g = settings.find(s => s.business_unit_id === null && s.cle === 'workflow_actif');
    return g ? g.valeur === 'true' : false;
  }, [settings, buId]);

  const total = useMemo(() => Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0), [amounts]);
  const canAdd = hasSubModuleLevel(user, 'commerce.versements', 'ajout');

  function buildLines() {
    return methods.filter(m => Number(amounts[m.id]) > 0).map(m => ({
      payment_method_id: m.id,
      amount: Number(amounts[m.id]),
      ...(m.code === 'banque' ? (bankRows[m.id] || {}) : {}),
    }));
  }

  async function save(soumettre) {
    setError('');
    if (!form.commercial_id) { setError('Sélectionnez un commercial.'); return; }
    const lines = buildLines();
    if (!lines.length) { setError('Renseignez au moins un montant.'); return; }
    setBusy(true);
    try {
      const payload = { ...form, lines, soumettre };
      const res = editing
        ? await client.put(`/commerce/versements/${id}`, payload)
        : await client.post('/commerce/versements', payload);
      navigate(`/commerce/versements/${res.data.id}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Erreur à l’enregistrement.');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <CommerceSubnav />
      <h1 className="page-title">{editing ? 'Modifier le versement' : 'Nouveau versement'}</h1>
      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}

      <section className="card" style={{ maxWidth: 720 }}>
        <div className="form-grid" style={{ maxWidth: 'none' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 200px' }}>Date
              <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
            </label>
            <label className="field" style={{ flex: '2 1 260px' }}>Commercial
              <select value={form.commercial_id} onChange={e => setForm(f => ({ ...f, commercial_id: e.target.value }))} required>
                <option value="" disabled>Sélectionner…</option>
                {commerciaux.map(c => <option key={c.id} value={c.id}>{c.code} — {c.prenom_affiche || ''} {c.nom_affiche || ''}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 200px' }}>BU
              <div style={{ padding: '8px 0', fontWeight: 600 }}>{commercial ? (commercial.business_unit_nom || '—') : '—'}</div>
            </div>
            <label className="field" style={{ flex: '2 1 260px' }}>Produit / activité (facultatif)
              <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
                <option value="">—</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
              </select>
            </label>
          </div>
        </div>

        <h2 style={{ fontSize: 15, marginTop: 18 }}>Moyens de versement</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {methods.map(m => (
            <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 320px', maxWidth: 380 }}>{m.libelle}
                <input type="number" min="0" step="1000" value={amounts[m.id] ?? ''} placeholder="0"
                  onChange={e => setAmounts(a => ({ ...a, [m.id]: e.target.value }))} />
              </label>
              {m.code === 'banque' && Number(amounts[m.id]) > 0 && (
                <div style={{ display: 'flex', gap: 8, flex: '2 1 380px', flexWrap: 'wrap' }}>
                  <label className="field" style={{ flex: '1 1 130px' }}>Banque
                    <select value={(bankRows[m.id]?.bank_id) || ''} onChange={e => setBankRows(br => ({ ...br, [m.id]: { ...br[m.id], bank_id: e.target.value } }))}>
                      <option value="">—</option>
                      {banks.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ flex: '1 1 130px' }}>Référence
                    <input value={(bankRows[m.id]?.transaction_reference) || ''} onChange={e => setBankRows(br => ({ ...br, [m.id]: { ...br[m.id], transaction_reference: e.target.value } }))} />
                  </label>
                  <label className="field" style={{ flex: '1 1 130px' }}>Date
                    <input type="date" value={(bankRows[m.id]?.transaction_date) || ''} onChange={e => setBankRows(br => ({ ...br, [m.id]: { ...br[m.id], transaction_date: e.target.value } }))} />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, padding: '10px 12px', background: 'var(--color-hover)', borderRadius: 8 }}>
          <strong>TOTAL</strong>
          <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{money(total)}</strong>
        </div>

        <label className="field" style={{ marginTop: 12 }}>Référence générale (facultatif)
          <input value={form.reference_generale} onChange={e => setForm(f => ({ ...f, reference_generale: e.target.value }))} placeholder="Ex. Caisse, recouvrement…" />
        </label>
        <label className="field">Commentaire
          <textarea rows={2} value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} />
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {workflowActif ? (
            <>
              <button className="btn btn-secondary" disabled={busy || !canAdd} onClick={() => save(false)}>Enregistrer brouillon</button>
              <button className="btn btn-primary" disabled={busy || !canAdd} onClick={() => save(true)}>Soumettre</button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={busy || !canAdd} onClick={() => save(false)}>Enregistrer</button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate('/commerce/versements')}>Annuler</button>
        </div>
        {!editing && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 0 }}>Les justificatifs s’ajoutent après enregistrement, sur la fiche du versement.</p>}
      </section>
    </div>
  );
}
