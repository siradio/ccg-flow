import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Saisie rapide d'un versement commercial. Un montant par moyen de versement (modèle normalisé).
// La BU est récupérée du commercial. Le total est calculé automatiquement. Les boutons s'adaptent
// au paramétrage du workflow (Enregistrer brouillon / Soumettre si activé, sinon Enregistrer).
const money = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' GNF';
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function VersementForm() {
  const { id } = useParams();
  const editing = !!id;
  const { user } = useAuth();
  const { t } = useI18n();
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
  const [stagedFiles, setStagedFiles] = useState([]);   // justificatifs à téléverser à l'enregistrement
  const [existingAtts, setExistingAtts] = useState([]);  // justificatifs déjà attachés (édition)

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
        setAmounts(a); setBankRows(br); setExistingAtts(v.attachments || []);
      }).catch(() => setError(t('com.ver.notFound')));
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
    if (!form.commercial_id) { setError(t('com.ver.selectCommercial')); return; }
    const lines = buildLines();
    if (!lines.length) { setError(t('com.ver.atLeastAmount')); return; }
    setBusy(true);
    try {
      const payload = { ...form, lines, soumettre };
      const res = editing
        ? await client.put(`/commerce/versements/${id}`, payload)
        : await client.post('/commerce/versements', payload);
      const vid = res.data.id;
      // Téléverse les justificatifs sélectionnés (à la saisie comme à l'édition).
      for (const f of stagedFiles) {
        const fd = new FormData(); fd.append('file', f);
        await client.post(`/commerce/versements/${vid}/attachments`, fd);
      }
      navigate(`/commerce/versements/${vid}`);
    } catch (e) {
      setError(e.response?.data?.error || t('com.ver.saveError'));
    } finally { setBusy(false); }
  }

  async function openAtt(attId) {
    try {
      const res = await client.get(`/commerce/versements/attachments/${attId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { setError(t('com.ver.openError')); }
  }
  async function delExistingAtt(attId) {
    if (!window.confirm(t('com.ver.confirmDeleteAtt'))) return;
    try { await client.delete(`/commerce/versements/attachments/${attId}`); setExistingAtts(a => a.filter(x => x.id !== attId)); }
    catch (e) { setError(e.response?.data?.error || t('com.ver.deleteError')); }
  }

  return (
    <div>
      <CommerceSubnav />
      <h1 className="page-title">{editing ? t('com.ver.editTitle') : t('com.ver.newTitle')}</h1>
      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}

      <section className="card" style={{ maxWidth: 720 }}>
        <div className="form-grid" style={{ maxWidth: 'none' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 200px' }}>{t('com.ver.date')}
              <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
            </label>
            <label className="field" style={{ flex: '2 1 260px' }}>{t('com.ver.commercial')}
              <select value={form.commercial_id} onChange={e => setForm(f => ({ ...f, commercial_id: e.target.value }))} required>
                <option value="" disabled>{t('com.ver.selectPlaceholder')}</option>
                {commerciaux.map(c => <option key={c.id} value={c.id}>{c.code} — {c.prenom_affiche || ''} {c.nom_affiche || ''}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 200px' }}>{t('com.ver.bu')}
              <div style={{ padding: '8px 0', fontWeight: 600 }}>{commercial ? (commercial.business_unit_nom || '—') : '—'}</div>
            </div>
            <label className="field" style={{ flex: '2 1 260px' }}>{t('com.ver.product')}
              <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
                <option value="">—</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.designation}</option>)}
              </select>
            </label>
          </div>
        </div>

        <h2 style={{ fontSize: 15, marginTop: 18 }}>{t('com.ver.methods')}</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {methods.map(m => (
            <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 320px', maxWidth: 380 }}>{m.libelle}
                <input type="number" min="0" step="1000" value={amounts[m.id] ?? ''} placeholder="0"
                  onChange={e => setAmounts(a => ({ ...a, [m.id]: e.target.value }))} />
              </label>
              {m.code === 'banque' && Number(amounts[m.id]) > 0 && (
                <div style={{ display: 'flex', gap: 8, flex: '2 1 380px', flexWrap: 'wrap' }}>
                  <label className="field" style={{ flex: '1 1 130px' }}>{t('com.ver.bank')}
                    <select value={(bankRows[m.id]?.bank_id) || ''} onChange={e => setBankRows(br => ({ ...br, [m.id]: { ...br[m.id], bank_id: e.target.value } }))}>
                      <option value="">—</option>
                      {banks.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ flex: '1 1 130px' }}>{t('com.ver.reference')}
                    <input value={(bankRows[m.id]?.transaction_reference) || ''} onChange={e => setBankRows(br => ({ ...br, [m.id]: { ...br[m.id], transaction_reference: e.target.value } }))} />
                  </label>
                  <label className="field" style={{ flex: '1 1 130px' }}>{t('com.ver.date')}
                    <input type="date" value={(bankRows[m.id]?.transaction_date) || ''} onChange={e => setBankRows(br => ({ ...br, [m.id]: { ...br[m.id], transaction_date: e.target.value } }))} />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, padding: '10px 12px', background: 'var(--color-hover)', borderRadius: 8 }}>
          <strong>{t('com.ver.total')}</strong>
          <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{money(total)}</strong>
        </div>

        <label className="field" style={{ marginTop: 12 }}>{t('com.ver.refGenerale')}
          <input value={form.reference_generale} onChange={e => setForm(f => ({ ...f, reference_generale: e.target.value }))} placeholder={t('com.ver.refGeneralePlaceholder')} />
        </label>
        <label className="field">{t('com.ver.comment')}
          <textarea rows={2} value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} />
        </label>

        <h2 style={{ fontSize: 15, marginTop: 18 }}>{t('com.ver.attachments')}</h2>
        {editing && existingAtts.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <button type="button" className="link-button" onClick={() => openAtt(a.id)}>{a.filename}</button>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{Math.round((a.taille || 0) / 1024)} {t('com.ver.kb')}</span>
            <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => delExistingAtt(a.id)}>{t('com.ver.delete')}</button>
          </div>
        ))}
        {stagedFiles.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <span>📎 {f.name}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{Math.round(f.size / 1024)} {t('com.ver.kb')} — {t('com.ver.toUpload')}</span>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setStagedFiles(fs => fs.filter((_, j) => j !== i))}>{t('com.ver.remove')}</button>
          </div>
        ))}
        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginTop: 6 }}>
          {t('com.ver.addAttachment')}
          <input type="file" accept=".pdf,image/png,image/jpeg" multiple style={{ display: 'none' }}
            onChange={e => { setStagedFiles(fs => [...fs, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
        </label>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{t('com.ver.attachmentHint')}</div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {workflowActif ? (
            <>
              <button className="btn btn-secondary" disabled={busy || !canAdd} onClick={() => save(false)}>{t('com.ver.saveDraft')}</button>
              <button className="btn btn-primary" disabled={busy || !canAdd} onClick={() => save(true)}>{t('com.ver.submit')}</button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={busy || !canAdd} onClick={() => save(false)}>{t('com.ver.save')}</button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate('/commerce/versements')}>{t('com.ver.cancel')}</button>
        </div>
      </section>
    </div>
  );
}
