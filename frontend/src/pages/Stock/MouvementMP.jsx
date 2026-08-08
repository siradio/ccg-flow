import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import LotPicker from './LotPicker';
import { useI18n } from '../../i18n/I18nContext';

// Refonte Stock (Lot 4) — Saisie d'un mouvement de MATIÈRE PREMIÈRE. Même moteur (grand livre) que
// les produits finis, avec en plus le rattachement production : ordre de fabrication, ligne/atelier,
// produit fini concerné, lot fournisseur, statut qualité. Quantité toujours positive.
// Libellés de sens traduits via t('sens.*'). QUALITE = valeurs stockées (FR), libellé traduit au rendu.
const SENS_COLOR = { entree: '#15803d', sortie: '#b91c1c', neutre: '#6b7280' };
const QUALITE = ['', 'Conforme', 'Non conforme', 'En attente', 'En quarantaine'];

const empty = () => ({
  date_mouvement: new Date().toISOString().slice(0, 10), business_unit_id: '', type_id: '', location_id: '',
  product_id: '', quantite: '', prix_unitaire: '', reference_document: '', numero_bon: '',
  ordre_fabrication: '', ligne_production: '', produit_fini_id: '', lot_fournisseur: '', statut_qualite: '', commentaire: '',
});

export default function MouvementMP() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canAdd = hasSubModuleLevel(user, 'stock.saisie', 'ajout');

  const [bus, setBus] = useState([]);
  const [types, setTypes] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(empty());
  const [lotSel, setLotSel] = useState({ lot_id: '', lot: null });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {});
    client.get('/stock-movement-types').then(r => setTypes(r.data.filter(t => t.actif))).catch(() => {});
    client.get('/products').then(r => setProducts(r.data)).catch(() => {});
    client.get('/stock-locations').then(r => setLocations(r.data.filter(l => l.actif))).catch(() => {});
  }, []);

  const inBu = p => !form.business_unit_id || String(p.business_unit_id) === String(form.business_unit_id);
  const mpProducts = useMemo(() => products.filter(p => p.type_article === 'matiere_premiere' && inBu(p)), [products, form.business_unit_id]);
  const finishedProducts = useMemo(() => products.filter(p => p.type_article === 'produit_fini' && inBu(p)), [products, form.business_unit_id]);
  const buLocations = useMemo(() => locations.filter(l => !l.business_unit_id || !form.business_unit_id || String(l.business_unit_id) === String(form.business_unit_id)), [locations, form.business_unit_id]);
  const selectedType = types.find(t => String(t.id) === String(form.type_id));
  const selectedProduct = mpProducts.find(p => String(p.id) === String(form.product_id));

  function set(k, v) {
    if (k === 'product_id' || k === 'type_id' || k === 'business_unit_id') setLotSel({ lot_id: '', lot: null });
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === 'business_unit_id') { next.product_id = ''; next.location_id = ''; next.produit_fini_id = ''; }
      if (k === 'product_id') {
        const p = products.find(x => String(x.id) === String(v));
        if (p && p.cout_standard && !f.prix_unitaire) next.prix_unitaire = p.cout_standard;
      }
      return next;
    });
  }

  if (!hasSubModuleLevel(user, 'stock.saisie')) return <div><StockSectionNav /><p>{t('mvtform.notAllowed')}</p></div>;

  async function submit(e) {
    e.preventDefault();
    setError(''); setMsg(null);
    if (!form.business_unit_id || !form.type_id || !form.product_id || !(Number(form.quantite) > 0)) {
      setError(t('mvtmp.required')); return;
    }
    try {
      const { data } = await client.post('/stock-mouvements', {
        date_mouvement: form.date_mouvement, type_id: Number(form.type_id), business_unit_id: Number(form.business_unit_id),
        location_id: form.location_id ? Number(form.location_id) : null, product_id: Number(form.product_id),
        quantite: Number(form.quantite), prix_unitaire: form.prix_unitaire === '' ? null : Number(form.prix_unitaire),
        reference_document: form.reference_document, numero_bon: form.numero_bon,
        ordre_fabrication: form.ordre_fabrication, ligne_production: form.ligne_production,
        produit_fini_id: form.produit_fini_id ? Number(form.produit_fini_id) : null,
        lot_fournisseur: form.lot_fournisseur, statut_qualite: form.statut_qualite, commentaire: form.commentaire,
        lot_id: lotSel.lot_id || null, lot: lotSel.lot || null,
      });
      setMsg({ reference: data.reference });
      setForm(f => ({ ...empty(), business_unit_id: f.business_unit_id, location_id: f.location_id, type_id: f.type_id }));
      setLotSel({ lot_id: '', lot: null });
    } catch (err) { setError(err.response?.data?.error || t('mvtform.saveError')); }
  }

  return (
    <div>
      <StockSectionNav />
      <h1 className="page-title" style={{ margin: '0 0 4px' }}>{t('mvtmp.title')}</h1>
      <p className="page-subtitle" style={{ margin: '0 0 12px' }}>{t('mvtmp.subtitle')}</p>

      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{t('mvtform.savedPre')} <strong>{msg.reference}</strong> {t('mvtform.savedSuffix')}</div>}

      {mpProducts.length === 0 && form.business_unit_id && (
        <div className="alert alert-warning" style={{ marginBottom: 12 }}>{t('mvtmp.noMp')}</div>
      )}

      {canAdd ? (
        <section className="card">
          <form onSubmit={submit} className="form-grid" style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: 1, minWidth: 150 }}>{t('mvtform.date')}
                <input type="date" value={form.date_mouvement} onChange={e => set('date_mouvement', e.target.value)} />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 180 }}>{t('mvtform.bu')}
                <select value={form.business_unit_id} onChange={e => set('business_unit_id', e.target.value)} required>
                  <option value="" disabled>{t('mvtform.choose')}</option>
                  {bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                </select>
              </label>
            </div>
            <label className="field">{t('mvtform.type')}
              <select value={form.type_id} onChange={e => set('type_id', e.target.value)} required>
                <option value="" disabled>{t('mvtform.choose')}</option>
                {types.map(ty => <option key={ty.id} value={ty.id}>{ty.libelle}</option>)}
              </select>
            </label>
            {selectedType && <div style={{ marginTop: -6, fontSize: 13, color: SENS_COLOR[selectedType.sens], fontWeight: 600 }}>{t('sens.' + selectedType.sens)}{selectedType.requiert_justificatif ? ` · ${t('mvtform.justifRequired')}` : ''}{selectedType.requiert_validation ? ` · ${t('mvtform.validationRequired')}` : ''}</div>}
            <label className="field">{t('mvtform.location')}
              <select value={form.location_id} onChange={e => set('location_id', e.target.value)}>
                <option value="">{t('mvtform.none')}</option>
                {buLocations.map(l => <option key={l.id} value={l.id}>{l.nom}{l.type !== 'entrepot' ? ` (${l.type})` : ''}</option>)}
              </select>
            </label>
            <label className="field">{t('mvtmp.product')}
              <select value={form.product_id} onChange={e => set('product_id', e.target.value)} required disabled={!form.business_unit_id}>
                <option value="" disabled>{form.business_unit_id ? t('mvtmp.chooseProduct') : t('mvtform.chooseBuFirst')}</option>
                {mpProducts.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + ' — ' : ''}{p.designation}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: 1, minWidth: 130 }}>{t('mvtform.quantity')} {selectedProduct?.unite ? `(${selectedProduct.unite})` : ''}
                <input type="number" min="0" step="0.001" value={form.quantite} onChange={e => set('quantite', e.target.value)} required />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 130 }}>{t('mvtmp.unitPriceCost')}
                <input type="number" min="0" step="0.01" value={form.prix_unitaire} onChange={e => set('prix_unitaire', e.target.value)} placeholder={t('mvtform.optional')} />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 130 }}>{t('mvtmp.supplierLot')}
                <input value={form.lot_fournisseur} onChange={e => set('lot_fournisseur', e.target.value)} placeholder={t('mvtform.optional')} />
              </label>
            </div>
            <LotPicker product={selectedProduct} sens={selectedType?.sens} locationId={form.location_id} value={lotSel} onChange={setLotSel} />

            <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px', margin: '4px 0' }}>
              <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 6px' }}>{t('mvtmp.prodLink')}</legend>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label className="field" style={{ flex: 1, minWidth: 150 }}>{t('mvtmp.mo')}
                  <input value={form.ordre_fabrication} onChange={e => set('ordre_fabrication', e.target.value)} placeholder={t('mvtmp.moPlaceholder')} />
                </label>
                <label className="field" style={{ flex: 1, minWidth: 150 }}>{t('mvtmp.line')}
                  <input value={form.ligne_production} onChange={e => set('ligne_production', e.target.value)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label className="field" style={{ flex: 1, minWidth: 180 }}>{t('mvtmp.finishedProduct')}
                  <select value={form.produit_fini_id} onChange={e => set('produit_fini_id', e.target.value)}>
                    <option value="">—</option>
                    {finishedProducts.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + ' — ' : ''}{p.designation}</option>)}
                  </select>
                </label>
                <label className="field" style={{ flex: 1, minWidth: 150 }}>{t('mvtmp.quality')}
                  <select value={form.statut_qualite} onChange={e => set('statut_qualite', e.target.value)}>
                    {QUALITE.map(q => <option key={q} value={q}>{q ? t('qualite.' + q) : '—'}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>

            <label className="field">{t('mvtform.refDoc')}
              <input value={form.reference_document} onChange={e => set('reference_document', e.target.value)} placeholder={t('mvtmp.refDocPlaceholder')} />
            </label>
            <label className="field">{t('mvtform.comment')}
              <textarea value={form.commentaire} onChange={e => set('commentaire', e.target.value)} />
            </label>
            {error && <div className="alert alert-danger">{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>{t('mvtform.submit')}</button>
          </form>
        </section>
      ) : <p>{t('mvtform.readonly')}</p>}
    </div>
  );
}
