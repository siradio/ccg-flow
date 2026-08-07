import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, isSuperAdmin } from '../../auth/AuthContext';
import WorkflowTimeline from '../../components/WorkflowTimeline';
import { useI18n } from '../../i18n/I18nContext';

// Statut fictif "rien n'a encore démarré" : sert uniquement à faire afficher WorkflowTimeline en
// mode aperçu (toutes les étapes "à venir") avant même qu'une demande existe.
const PREVIEW_PR = { status: 'brouillon', approvals: [] };

// Clé stable pour les lignes du formulaire (Date.now/Math.random évités : simple compteur incrémental).
let _lineKey = 0;
const emptyLine = () => ({ key: ++_lineKey, productId: '', descriptionLibre: '', quantite: '', unite: '' });

export default function CreatePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [entities, setEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [products, setProducts] = useState([]);
  const [steps, setSteps] = useState([]);
  const [form, setForm] = useState({ entityId: '', objet: '', justification: '', businessUnitId: '' });
  const [proforma, setProforma] = useState(null);
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false); // 'submit' | 'draft' | false

  const allowedEntityIds = useMemo(() => {
    if (isSuperAdmin(user)) return 'all';
    return [...new Set(user.roles.map(r => r.entity_id).filter(Boolean))];
  }, [user]);

  useEffect(() => {
    client.get('/entities').then(res => {
      const list = allowedEntityIds === 'all' ? res.data : res.data.filter(e => allowedEntityIds.includes(e.id));
      setEntities(list);
      if (list.length === 1) setForm(f => ({ ...f, entityId: list[0].id }));
    });
  }, [allowedEntityIds]);

  useEffect(() => {
    client.get('/workflows/demande_achat').then(res => setSteps(res.data.steps));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
  }, []);

  // Les articles proposés dépendent de l'entité choisie (référentiel produits scopé par entité).
  // Changer d'entité recharge la liste et repart sur une ligne vierge (les anciens choix ne valent plus).
  useEffect(() => {
    if (!form.entityId) { setProducts([]); return; }
    client.get('/products', { params: { entity_id: form.entityId } }).then(res => setProducts(res.data)).catch(() => setProducts([]));
    setLines([emptyLine()]);
  }, [form.entityId]);

  const selectedEntity = entities.find(e => String(e.id) === String(form.entityId));
  const isSoguipal = selectedEntity?.code === 'SOGUIPAL';

  function setLine(key, patch) {
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  }
  function onPickProduct(key, productId) {
    const p = products.find(x => String(x.id) === String(productId));
    setLine(key, { productId, descriptionLibre: '', unite: p?.unite || '' });
  }
  function addLine() { setLines(ls => [...ls, emptyLine()]); }
  function removeLine(key) { setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : ls)); }

  // Une ligne est « complète » si elle désigne un article (référentiel OU description libre) ET a une quantité > 0.
  const validLines = lines.filter(l => (l.productId || l.descriptionLibre.trim()) && Number(l.quantite) > 0);

  async function persist(doSubmit) {
    setError('');
    if (!form.entityId) { setError(t('prc.entityRequired')); return; }
    if (!form.objet.trim()) { setError(t('prc.subjectRequired')); return; }
    // Le détail des articles est facultatif seulement si un proforma est joint.
    if (!proforma && validLines.length === 0) { setError(t('prc.needItemsOrProforma')); return; }

    setSaving(doSubmit ? 'submit' : 'draft');
    try {
      const payload = { entityId: Number(form.entityId), objet: form.objet, justification: form.justification };
      if (isSoguipal && form.businessUnitId) payload.businessUnitId = Number(form.businessUnitId);
      const res = await client.post('/purchase-requests', payload);
      const id = res.data.id;
      for (const l of validLines) {
        await client.post(`/purchase-requests/${id}/lines`, {
          productId: l.productId ? Number(l.productId) : null,
          descriptionLibre: l.productId ? null : (l.descriptionLibre.trim() || null),
          quantite: Number(l.quantite),
          unite: l.unite || null,
        });
      }
      if (proforma) {
        const fd = new FormData();
        fd.append('file', proforma);
        await client.post(`/purchase-requests/${id}/attachments`, fd);
      }
      if (doSubmit) await client.post(`/purchase-requests/${id}/submit`);
      navigate(`/purchase-requests/${id}`);
    } catch (err) {
      setError(err.response?.data?.error || t('prc.createError'));
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 4 }}>{t('prc.title')}</h1>
      <p className="page-subtitle" style={{ marginBottom: 20, maxWidth: 560 }}>
        {t('prc.subtitlePre')}<strong>{t('prc.needsStatement')}</strong>{t('prc.subtitlePost')}
      </p>

      {steps.length > 0 && (
        <div className="card" style={{ maxWidth: 560 }}>
          <WorkflowTimeline pr={PREVIEW_PR} steps={steps} />
        </div>
      )}

      <div className="card" style={{ maxWidth: 560 }}>
        <form onSubmit={e => { e.preventDefault(); persist(true); }} className="form-grid" style={{ maxWidth: 'none' }}>
          <label className="field">
            {t('prc.entity')}
            <select value={form.entityId} onChange={e => setForm({ ...form, entityId: e.target.value, businessUnitId: '' })} required>
              <option value="" disabled>{t('prc.select')}</option>
              {entities.map(e => <option key={e.id} value={e.id}>{e.code}</option>)}
            </select>
          </label>
          {isSoguipal && (
            <label className="field">
              {t('stockreleve.bu')}
              <select value={form.businessUnitId} onChange={e => setForm({ ...form, businessUnitId: e.target.value })}>
                <option value="">{t('cockpit.allBu')}</option>
                {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            {t('prc.subject')}
            <input value={form.objet} onChange={e => setForm({ ...form, objet: e.target.value })} required />
          </label>
          <label className="field">
            {t('prc.justification')}
            <textarea value={form.justification} onChange={e => setForm({ ...form, justification: e.target.value })} style={{ minHeight: 70 }} />
          </label>

          {/* Détail des articles — fusionné dans l'écran de création */}
          <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0 0', paddingTop: 14 }}>
            <strong style={{ fontSize: 14 }}>{t('prc.articles')}</strong>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 10px' }}>{t('prc.articleHint')}</p>

            {lines.map(l => {
              const isFree = !l.productId;
              return (
                <div key={l.key} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed var(--color-border)' }}>
                  <label className="field" style={{ flex: '2 1 220px', minWidth: 0 }}>
                    {t('prc.article')}
                    <select value={l.productId} onChange={e => onPickProduct(l.key, e.target.value)} disabled={!form.entityId}>
                      <option value="">{t('prc.freeItem')}</option>
                      {products.length > 0 && (
                        <optgroup label={t('prc.fromReferential')}>
                          {products.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + ' — ' : ''}{p.designation}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </label>
                  {isFree && (
                    <label className="field" style={{ flex: '2 1 200px', minWidth: 0 }}>
                      {t('prc.desc')}
                      <input value={l.descriptionLibre} onChange={e => setLine(l.key, { descriptionLibre: e.target.value })} placeholder={t('prc.descPlaceholder')} />
                    </label>
                  )}
                  <label className="field" style={{ flex: '1 1 90px', minWidth: 0 }}>
                    {t('prc.qty')}
                    <input type="number" min="0" step="0.001" value={l.quantite} onChange={e => setLine(l.key, { quantite: e.target.value })} />
                  </label>
                  <label className="field" style={{ flex: '1 1 90px', minWidth: 0 }}>
                    {t('prc.unit')}
                    <input value={l.unite} onChange={e => setLine(l.key, { unite: e.target.value })} />
                  </label>
                  {lines.length > 1 && (
                    <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 2 }} onClick={() => removeLine(l.key)} title={t('prc.removeLine')}>✕</button>
                  )}
                </div>
              );
            })}
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} disabled={!form.entityId}>{t('prc.addLine')}</button>
          </div>

          <label className="field">
            {t('prc.proforma')}
            <input type="file" accept="application/pdf,image/*" onChange={e => setProforma(e.target.files[0] || null)} />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{t('prc.proformaOptionalNote')}</span>
          </label>

          {error && <div className="alert alert-danger">{error}</div>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" disabled={!!saving} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              {saving === 'submit' ? t('prc.submitting') : t('prc.submit')}
            </button>
            <button type="button" disabled={!!saving} className="btn btn-secondary" onClick={() => persist(false)} style={{ justifyContent: 'center' }}>
              {saving === 'draft' ? t('common.saving') : t('prc.saveDraft')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
