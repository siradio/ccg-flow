import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';

// Refonte Stock (Lot 4) — Saisie d'un mouvement de MATIÈRE PREMIÈRE. Même moteur (grand livre) que
// les produits finis, avec en plus le rattachement production : ordre de fabrication, ligne/atelier,
// produit fini concerné, lot fournisseur, statut qualité. Quantité toujours positive.
const SENS_LABEL = { entree: '+ Entrée en stock', sortie: '− Sortie de stock', neutre: 'Neutre' };
const SENS_COLOR = { entree: '#15803d', sortie: '#b91c1c', neutre: '#6b7280' };
const QUALITE = ['', 'Conforme', 'Non conforme', 'En attente', 'En quarantaine'];

const empty = () => ({
  date_mouvement: new Date().toISOString().slice(0, 10), business_unit_id: '', type_id: '', location_id: '',
  product_id: '', quantite: '', prix_unitaire: '', reference_document: '', numero_bon: '',
  ordre_fabrication: '', ligne_production: '', produit_fini_id: '', lot_fournisseur: '', statut_qualite: '', commentaire: '',
});

export default function MouvementMP() {
  const { user } = useAuth();
  const canAdd = hasSubModuleLevel(user, 'stock.saisie', 'ajout');

  const [bus, setBus] = useState([]);
  const [types, setTypes] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(empty());
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
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

  if (!hasSubModuleLevel(user, 'stock.saisie')) return <div><StockSectionNav /><p>La saisie des mouvements ne vous a pas été accordée.</p></div>;

  async function submit(e) {
    e.preventDefault();
    setError(''); setMsg(null);
    if (!form.business_unit_id || !form.type_id || !form.product_id || !(Number(form.quantite) > 0)) {
      setError('Business Unit, type, matière première et quantité (> 0) sont obligatoires.'); return;
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
      });
      setMsg({ reference: data.reference });
      setForm(f => ({ ...empty(), business_unit_id: f.business_unit_id, location_id: f.location_id, type_id: f.type_id }));
    } catch (err) { setError(err.response?.data?.error || 'Erreur à l\'enregistrement.'); }
  }

  return (
    <div>
      <StockSectionNav />
      <h1 className="page-title" style={{ margin: '0 0 4px' }}>Saisie matière première</h1>
      <p className="page-subtitle" style={{ margin: '0 0 12px' }}>Réception, consommation en production, quarantaine… avec rattachement à un ordre de fabrication.</p>

      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>Mouvement <strong>{msg.reference}</strong> enregistré.</div>}

      {mpProducts.length === 0 && form.business_unit_id && (
        <div className="alert alert-warning" style={{ marginBottom: 12 }}>Aucune matière première pour cette BU. Créez-en dans Référentiels → Produits (type d'article = matière première).</div>
      )}

      {canAdd ? (
        <section className="card">
          <form onSubmit={submit} className="form-grid" style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: 1, minWidth: 150 }}>Date
                <input type="date" value={form.date_mouvement} onChange={e => set('date_mouvement', e.target.value)} />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 180 }}>Business Unit *
                <select value={form.business_unit_id} onChange={e => set('business_unit_id', e.target.value)} required>
                  <option value="" disabled>Choisir…</option>
                  {bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                </select>
              </label>
            </div>
            <label className="field">Type de mouvement *
              <select value={form.type_id} onChange={e => set('type_id', e.target.value)} required>
                <option value="" disabled>Choisir…</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select>
            </label>
            {selectedType && <div style={{ marginTop: -6, fontSize: 13, color: SENS_COLOR[selectedType.sens], fontWeight: 600 }}>{SENS_LABEL[selectedType.sens]}{selectedType.requiert_justificatif ? ' · justificatif requis' : ''}{selectedType.requiert_validation ? ' · soumis à validation' : ''}</div>}
            <label className="field">Localisation
              <select value={form.location_id} onChange={e => set('location_id', e.target.value)}>
                <option value="">— (aucune)</option>
                {buLocations.map(l => <option key={l.id} value={l.id}>{l.nom}{l.type !== 'entrepot' ? ` (${l.type})` : ''}</option>)}
              </select>
            </label>
            <label className="field">Matière première *
              <select value={form.product_id} onChange={e => set('product_id', e.target.value)} required disabled={!form.business_unit_id}>
                <option value="" disabled>{form.business_unit_id ? 'Choisir une matière première…' : 'Choisissez d\'abord une BU'}</option>
                {mpProducts.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + ' — ' : ''}{p.designation}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: 1, minWidth: 130 }}>Quantité * {selectedProduct?.unite ? `(${selectedProduct.unite})` : ''}
                <input type="number" min="0" step="0.001" value={form.quantite} onChange={e => set('quantite', e.target.value)} required />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 130 }}>Prix / coût unitaire
                <input type="number" min="0" step="0.01" value={form.prix_unitaire} onChange={e => set('prix_unitaire', e.target.value)} placeholder="optionnel" />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 130 }}>Lot fournisseur
                <input value={form.lot_fournisseur} onChange={e => set('lot_fournisseur', e.target.value)} placeholder="optionnel" />
              </label>
            </div>

            <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px', margin: '4px 0' }}>
              <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 6px' }}>Rattachement production (optionnel)</legend>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label className="field" style={{ flex: 1, minWidth: 150 }}>Ordre de fabrication
                  <input value={form.ordre_fabrication} onChange={e => set('ordre_fabrication', e.target.value)} placeholder="ex. OF-2045" />
                </label>
                <label className="field" style={{ flex: 1, minWidth: 150 }}>Ligne / atelier
                  <input value={form.ligne_production} onChange={e => set('ligne_production', e.target.value)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label className="field" style={{ flex: 1, minWidth: 180 }}>Produit fini concerné
                  <select value={form.produit_fini_id} onChange={e => set('produit_fini_id', e.target.value)}>
                    <option value="">—</option>
                    {finishedProducts.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + ' — ' : ''}{p.designation}</option>)}
                  </select>
                </label>
                <label className="field" style={{ flex: 1, minWidth: 150 }}>Statut qualité
                  <select value={form.statut_qualite} onChange={e => set('statut_qualite', e.target.value)}>
                    {QUALITE.map(q => <option key={q} value={q}>{q || '—'}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>

            <label className="field">Référence document
              <input value={form.reference_document} onChange={e => set('reference_document', e.target.value)} placeholder="BR, bon de sortie…" />
            </label>
            <label className="field">Commentaire
              <textarea value={form.commentaire} onChange={e => set('commentaire', e.target.value)} />
            </label>
            {error && <div className="alert alert-danger">{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>Enregistrer le mouvement</button>
          </form>
        </section>
      ) : <p>Vous êtes en consultation seule pour la saisie.</p>}
    </div>
  );
}
