import { useEffect, useState } from 'react';
import client from '../../api/client';

// Refonte Stock (Lot 2) — Bloc lot réutilisé par les écrans de saisie. Ne s'affiche que si le
// produit est géré par lot. À l'entrée : on crée un nouveau lot (numéro + dates). À la sortie :
// on choisit un lot existant, proposés en FEFO (péremption la plus proche en premier).
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');

export default function LotPicker({ product, sens, locationId, value, onChange }) {
  const [available, setAvailable] = useState([]);
  const gereLot = product && product.gere_par_lot;

  useEffect(() => {
    if (!gereLot || sens !== 'sortie' || !product) { setAvailable([]); return; }
    const qs = `product_id=${product.id}${locationId ? `&location_id=${locationId}` : ''}`;
    client.get(`/stock-lots/available?${qs}`).then(r => setAvailable(r.data)).catch(() => setAvailable([]));
  }, [gereLot, sens, product, locationId]);

  if (!gereLot) return null;

  if (sens === 'entree') {
    const lot = value.lot || {};
    const setLot = patch => onChange({ lot_id: null, lot: { ...lot, ...patch } });
    return (
      <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px', margin: '4px 0' }}>
        <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 6px' }}>Nouveau lot (produit géré par lot)</legend>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: 1, minWidth: 140 }}>N° de lot *
            <input value={lot.numero_lot || ''} onChange={e => setLot({ numero_lot: e.target.value })} placeholder="ex. L2026-014" />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 140 }}>Date de fabrication
            <input type="date" value={lot.date_fabrication || ''} onChange={e => setLot({ date_fabrication: e.target.value })} />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 140 }}>Date de péremption
            <input type="date" value={lot.date_peremption || ''} onChange={e => setLot({ date_peremption: e.target.value })} />
          </label>
        </div>
      </fieldset>
    );
  }

  if (sens === 'sortie') {
    return (
      <label className="field">Lot à sortir (FEFO — péremption la plus proche d'abord)
        <select value={value.lot_id || ''} onChange={e => onChange({ lot_id: e.target.value, lot: null })}>
          <option value="">— (sans lot)</option>
          {available.map(l => (
            <option key={l.id} value={l.id}>
              {l.numero_lot} · reste {Number(l.quantite_restante)} {product.unite || ''}{l.date_peremption ? ` · périme ${d10(l.date_peremption)} (${l.jours_avant_peremption}j)` : ''}
            </option>
          ))}
        </select>
        {available.length === 0 && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Aucun lot disponible pour ce produit à cet emplacement.</span>}
      </label>
    );
  }
  return null;
}
