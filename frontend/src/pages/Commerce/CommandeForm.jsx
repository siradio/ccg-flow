import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import CommerceSubnav from './CommerceSubnav';

// Formulaire de bon de commande commercial (Yaourt = casiers / Divers = cartons).
// Grille pré-chargée avec les produits finis de la/les BU du formulaire ; le commercial ne choisit
// pas les produits, seulement les quantités. Prix et totaux recalculés côté serveur (ici affichage).
const fmt = n => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR'));
const TYPE_LABEL = { yaourt: 'Yaourt', divers: 'Divers' };

export default function CommandeForm() {
  const { type: routeType, id } = useParams();
  const editing = !!id;
  const nav = useNavigate();

  const [type, setType] = useState(routeType || 'yaourt');
  const [unite, setUnite] = useState('casier');
  const [catalogue, setCatalogue] = useState([]);
  const [commerciaux, setCommerciaux] = useState([]);
  const [grossistes, setGrossistes] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [beneficiaireType, setBeneficiaireType] = useState('commercial');
  const [commercialId, setCommercialId] = useState('');
  const [grossisteId, setGrossisteId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [qty, setQty] = useState({});          // { product_id: '12' }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!editing);

  // Référentiels bénéficiaires + véhicules.
  useEffect(() => {
    client.get('/commerce/commerciaux').then(r => setCommerciaux(r.data)).catch(() => {});
    client.get('/commerce/grossistes', { params: { statut: 'actif' } }).then(r => setGrossistes(r.data)).catch(() => {});
    client.get('/vehicles').then(r => setVehicles(r.data)).catch(() => {});
  }, []);

  // Catalogue du formulaire (dépend du type).
  useEffect(() => {
    client.get('/commerce/commandes/catalogue', { params: { type } })
      .then(r => { setCatalogue(r.data.products || []); setUnite(r.data.unite || 'casier'); })
      .catch(() => setCatalogue([]));
  }, [type]);

  // En édition : charge la commande existante.
  useEffect(() => {
    if (!editing) return;
    client.get(`/commerce/commandes/${id}`).then(r => {
      const c = r.data;
      setType(c.type_formulaire); setBeneficiaireType(c.beneficiaire_type);
      setCommercialId(c.commercial_id || ''); setGrossisteId(c.grossiste_id || '');
      setVehicleId(c.vehicle_id || '');
      setQty(Object.fromEntries((c.lignes || []).map(l => [l.product_id, String(l.quantite)])));
      setLoaded(true);
    }).catch(() => { setError('Commande introuvable.'); setLoaded(true); });
  }, [editing, id]);

  const vehicleById = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles]);

  // Pré-remplit le véhicule depuis le commercial sélectionné (si non déjà choisi).
  function onSelectCommercial(cid) {
    setCommercialId(cid);
    const c = commerciaux.find(x => String(x.id) === String(cid));
    if (c && c.vehicle_id && !vehicleId) setVehicleId(c.vehicle_id);
  }

  const priceOf = p => (beneficiaireType === 'grossiste' ? p.prix_grossiste : p.prix_commercial);

  const totals = useMemo(() => {
    let q = 0, montant = 0;
    for (const p of catalogue) {
      const n = Number(qty[p.product_id]);
      if (!Number.isInteger(n) || n <= 0) continue;
      const prix = Number(priceOf(p));
      if (!Number.isFinite(prix)) continue;
      q += n; montant += n * prix;
    }
    return { q, montant };
  }, [catalogue, qty, beneficiaireType]);

  const capacity = useMemo(() => {
    const v = vehicleById[vehicleId];
    if (!v) return null;
    const cap = unite === 'casier' ? v.capacite_casiers : v.capacite_cartons;
    return cap && cap > 0 ? cap : null;
  }, [vehicleById, vehicleId, unite]);
  const taux = capacity ? Math.round((totals.q / capacity) * 1000) / 10 : null;
  const gaugeColor = taux == null ? '#9ca3af' : taux > 100 ? '#dc2626' : taux >= 100 ? '#128a54' : '#b45309';

  function setQ(pid, v) {
    if (v === '') { setQty({ ...qty, [pid]: '' }); return; }
    if (!/^\d+$/.test(v)) return;                 // entier positif uniquement
    setQty({ ...qty, [pid]: v });
  }

  function buildPayload() {
    const lines = catalogue
      .map(p => ({ product_id: p.product_id, quantite: Number(qty[p.product_id]) }))
      .filter(l => Number.isInteger(l.quantite) && l.quantite > 0);
    return {
      type_formulaire: type, beneficiaire_type: beneficiaireType,
      commercial_id: beneficiaireType === 'commercial' ? commercialId : null,
      grossiste_id: beneficiaireType === 'grossiste' ? grossisteId : null,
      vehicle_id: vehicleId || null, lines,
    };
  }

  function validateClient() {
    if (beneficiaireType === 'commercial' && !commercialId) return 'Sélectionnez le commercial bénéficiaire.';
    if (beneficiaireType === 'grossiste' && !grossisteId) return 'Sélectionnez le grossiste bénéficiaire.';
    if (totals.q <= 0) return 'Saisissez au moins une quantité positive.';
    if (taux != null && taux > 100) return `Charge (${totals.q}) supérieure à la capacité du véhicule (${capacity}).`;
    return '';
  }

  async function save() {
    const msg = beneficiaireType === 'commercial' && !commercialId ? 'Sélectionnez le commercial bénéficiaire.'
      : beneficiaireType === 'grossiste' && !grossisteId ? 'Sélectionnez le grossiste bénéficiaire.' : '';
    if (msg) { setError(msg); return null; }
    setBusy(true); setError('');
    try {
      const payload = buildPayload();
      const r = editing ? await client.put(`/commerce/commandes/${id}`, payload)
        : await client.post('/commerce/commandes', payload);
      return r.data.id;
    } catch (e) {
      setError(e?.response?.data?.error || "Erreur lors de l'enregistrement."); return null;
    } finally { setBusy(false); }
  }

  async function onSaveDraft() {
    const savedId = await save();
    if (savedId) nav(`/commerce/commandes/${savedId}`);
  }

  async function onSubmit() {
    const clientMsg = validateClient();
    if (clientMsg) { setError(clientMsg); return; }
    const savedId = await save();
    if (!savedId) return;
    setBusy(true); setError('');
    try {
      await client.post(`/commerce/commandes/${savedId}/submit`, {});
      nav(`/commerce/commandes/${savedId}`);
    } catch (e) {
      const data = e?.response?.data;
      if (data?.code === 'motif_requis') {
        const motif = window.prompt(`Remplissage ${data.taux}% < seuil ${data.seuil}%.\nMotif de sous-charge (obligatoire) :`);
        if (motif && motif.trim()) {
          try { await client.post(`/commerce/commandes/${savedId}/submit`, { motif_sous_charge: motif.trim() }); nav(`/commerce/commandes/${savedId}`); return; }
          catch (e2) { setError(e2?.response?.data?.error || 'Erreur à la soumission.'); }
        } else { setError('Soumission annulée : motif requis.'); }
      } else {
        setError(data?.error || 'Erreur à la soumission.');
      }
    } finally { setBusy(false); }
  }

  if (!loaded) return <div><CommerceSubnav /><p style={{ padding: 16 }}>Chargement…</p></div>;

  // Regroupe le catalogue par BU (utile surtout pour Divers).
  const groups = [];
  const byGroup = {};
  for (const p of catalogue) {
    const g = p.business_unit_nom || 'Sans BU';
    if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
    byGroup[g].push(p);
  }

  return (
    <div>
      <CommerceSubnav />
      <div style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>{editing ? 'Modifier' : 'Nouveau'} bon de commande — {TYPE_LABEL[type]} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({unite}s)</span></h2>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <label>Bénéficiaire
            <select value={beneficiaireType} onChange={e => setBeneficiaireType(e.target.value)} style={{ display: 'block' }}>
              <option value="commercial">Commercial</option>
              <option value="grossiste">Grossiste</option>
            </select>
          </label>
          {beneficiaireType === 'commercial' ? (
            <label>Commercial
              <select value={commercialId} onChange={e => onSelectCommercial(e.target.value)} style={{ display: 'block' }}>
                <option value="">— choisir —</option>
                {commerciaux.map(c => <option key={c.id} value={c.id}>{c.code} — {c.prenom_affiche || ''} {c.nom_affiche || ''}</option>)}
              </select>
            </label>
          ) : (
            <label>Grossiste
              <select value={grossisteId} onChange={e => setGrossisteId(e.target.value)} style={{ display: 'block' }}>
                <option value="">— choisir —</option>
                {grossistes.map(g => <option key={g.id} value={g.id}>{g.code} — {g.raison_sociale}</option>)}
              </select>
            </label>
          )}
          <label>Véhicule
            <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} style={{ display: 'block' }}>
              <option value="">— aucun —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.immatriculation}{v.marque ? ' — ' + v.marque : ''}</option>)}
            </select>
          </label>
        </div>

        {/* Jauge de remplissage */}
        <div style={{ marginBottom: 16, maxWidth: 520 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span>Remplissage véhicule</span>
            <span style={{ color: gaugeColor, fontWeight: 600 }}>
              {capacity ? `${fmt(totals.q)} / ${fmt(capacity)} ${unite}s (${taux}%)` : `${fmt(totals.q)} ${unite}s — capacité non définie`}
            </span>
          </div>
          <div style={{ height: 10, background: 'var(--color-hover)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(taux || 0, 100)}%`, height: '100%', background: gaugeColor, transition: 'width .2s' }} />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr><th>Produit</th><th style={{ textAlign: 'right' }}>Prix unitaire</th><th style={{ width: 120 }}>Quantité ({unite}s)</th><th style={{ textAlign: 'right' }}>Montant</th></tr>
            </thead>
            <tbody>
              {catalogue.length === 0 && <tr><td colSpan={4}>Aucun produit fini pour ce formulaire. Vérifiez les Business Units et les tarifs.</td></tr>}
              {groups.map(g => (
                <Fragment key={'grp' + g}>
                  {groups.length > 1 && <tr><td colSpan={4} style={{ fontWeight: 600, background: 'var(--color-hover)' }}>{g}</td></tr>}
                  {byGroup[g].map(p => {
                    const prix = priceOf(p);
                    const missing = prix == null;
                    const n = Number(qty[p.product_id]);
                    const montant = Number.isInteger(n) && n > 0 && !missing ? n * Number(prix) : 0;
                    return (
                      <tr key={p.product_id}>
                        <td>{p.code ? `${p.code} — ` : ''}{p.designation}</td>
                        <td style={{ textAlign: 'right', color: missing ? '#dc2626' : undefined }}>{missing ? 'tarif manquant' : fmt(prix) + ' GNF'}</td>
                        <td>
                          <input type="text" inputMode="numeric" value={qty[p.product_id] ?? ''} disabled={missing}
                            onChange={e => setQ(p.product_id, e.target.value)} style={{ width: 90 }} />
                        </td>
                        <td style={{ textAlign: 'right' }}>{montant ? fmt(montant) + ' GNF' : '—'}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td><td></td>
                <td>{fmt(totals.q)} {unite}s</td>
                <td style={{ textAlign: 'right' }}>{fmt(totals.montant)} GNF</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={() => nav('/commerce/commandes')} disabled={busy}>Annuler</button>
          <button className="btn" onClick={onSaveDraft} disabled={busy}>Enregistrer le brouillon</button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={busy}>Soumettre</button>
        </div>
      </div>
    </div>
  );
}
