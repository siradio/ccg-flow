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

  useEffect(() => {
    client.get('/commerce/commerciaux').then(r => setCommerciaux(r.data)).catch(() => {});
    client.get('/commerce/grossistes', { params: { statut: 'actif' } }).then(r => setGrossistes(r.data)).catch(() => {});
    client.get('/vehicles').then(r => setVehicles(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    client.get('/commerce/commandes/catalogue', { params: { type } })
      .then(r => { setCatalogue(r.data.products || []); setUnite(r.data.unite || 'casier'); })
      .catch(() => setCatalogue([]));
  }, [type]);

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

  function onSelectCommercial(cid) {
    setCommercialId(cid);
    const c = commerciaux.find(x => String(x.id) === String(cid));
    if (c && c.vehicle_id && !vehicleId) setVehicleId(c.vehicle_id);
  }

  const priceOf = p => (beneficiaireType === 'grossiste' ? p.prix_grossiste : p.prix_commercial);

  const totals = useMemo(() => {
    let q = 0, montant = 0, lignes = 0;
    for (const p of catalogue) {
      const n = Number(qty[p.product_id]);
      if (!Number.isInteger(n) || n <= 0) continue;
      const prix = Number(priceOf(p));
      if (!Number.isFinite(prix)) continue;
      q += n; montant += n * prix; lignes += 1;
    }
    return { q, montant, lignes };
  }, [catalogue, qty, beneficiaireType]);

  const capacity = useMemo(() => {
    const v = vehicleById[vehicleId];
    if (!v) return null;
    const cap = unite === 'casier' ? v.capacite_casiers : v.capacite_cartons;
    return cap && cap > 0 ? cap : null;
  }, [vehicleById, vehicleId, unite]);
  const taux = capacity ? Math.round((totals.q / capacity) * 1000) / 10 : null;
  const gaugeColor = taux == null ? '#9ca3af' : taux > 100 ? '#dc2626' : taux >= 100 ? '#16a34a' : '#d97706';
  const tarifsManquants = useMemo(() => catalogue.filter(p => priceOf(p) == null).length, [catalogue, beneficiaireType]);

  function setQ(pid, v) {
    if (v === '') { setQty({ ...qty, [pid]: '' }); return; }
    if (!/^\d+$/.test(v)) return;
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

  const groups = [];
  const byGroup = {};
  for (const p of catalogue) {
    const g = p.business_unit_nom || 'Sans BU';
    if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
    byGroup[g].push(p);
  }

  const card = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10 };
  const lbl = { fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 };
  const sel = { display: 'block', width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--color-border-strong)', background: 'var(--color-bg)', color: 'var(--color-text)' };

  return (
    <div>
      <CommerceSubnav />
      <div style={{ padding: '16px 16px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{editing ? 'Modifier' : 'Nouveau'} bon de commande</h2>
          <span style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontWeight: 700, padding: '4px 12px', borderRadius: 999, fontSize: 14 }}>
            {TYPE_LABEL[type]} · {unite}s
          </span>
          {tarifsManquants > 0 && (
            <span style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-fg)', padding: '4px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 600 }}>
              {tarifsManquants} tarif(s) manquant(s)
            </span>
          )}
        </div>

        {/* Bénéficiaire + véhicule + jauge */}
        <div style={{ ...card, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, alignItems: 'start' }}>
          <div>
            <label style={lbl}>Bénéficiaire</label>
            <select value={beneficiaireType} onChange={e => setBeneficiaireType(e.target.value)} style={sel}>
              <option value="commercial">Commercial</option>
              <option value="grossiste">Grossiste</option>
            </select>
          </div>
          {beneficiaireType === 'commercial' ? (
            <div>
              <label style={lbl}>Commercial</label>
              <select value={commercialId} onChange={e => onSelectCommercial(e.target.value)} style={sel}>
                <option value="">— choisir —</option>
                {commerciaux.map(c => <option key={c.id} value={c.id}>{c.code} — {c.prenom_affiche || ''} {c.nom_affiche || ''}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label style={lbl}>Grossiste</label>
              <select value={grossisteId} onChange={e => setGrossisteId(e.target.value)} style={sel}>
                <option value="">— choisir —</option>
                {grossistes.map(g => <option key={g.id} value={g.id}>{g.code} — {g.raison_sociale}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={lbl}>Véhicule</label>
            <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} style={sel}>
              <option value="">— aucun —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.immatriculation}{v.marque ? ' — ' + v.marque : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Remplissage véhicule</label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span style={{ color: gaugeColor, fontWeight: 700, fontSize: 14 }}>
                {capacity ? `${fmt(totals.q)} / ${fmt(capacity)} (${taux}%)` : `${fmt(totals.q)} ${unite}s`}
              </span>
              {!capacity && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>capacité n.d.</span>}
            </div>
            <div style={{ height: 12, background: 'var(--color-hover)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              <div style={{ width: `${Math.min(taux || 0, 100)}%`, height: '100%', background: gaugeColor, transition: 'width .25s ease' }} />
            </div>
          </div>
        </div>

        {/* Grille produits */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'var(--color-navy)', color: '#fff' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11.5, letterSpacing: '.04em', textTransform: 'uppercase' }}>Produit</th>
                  <th style={{ textAlign: 'right', padding: '10px 14px', fontSize: 11.5, letterSpacing: '.04em', textTransform: 'uppercase' }}>Prix unitaire</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontSize: 11.5, letterSpacing: '.04em', textTransform: 'uppercase', width: 130 }}>Quantité ({unite}s)</th>
                  <th style={{ textAlign: 'right', padding: '10px 14px', fontSize: 11.5, letterSpacing: '.04em', textTransform: 'uppercase', width: 150 }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {catalogue.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Aucun produit fini pour ce formulaire. Vérifiez les Business Units et les tarifs.
                  </td></tr>
                )}
                {groups.map(g => (
                  <Fragment key={'grp' + g}>
                    {groups.length > 1 && (
                      <tr><td colSpan={4} style={{ padding: '6px 14px', fontWeight: 700, fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--color-primary)', background: 'var(--color-primary-soft)' }}>{g}</td></tr>
                    )}
                    {byGroup[g].map((p, i) => {
                      const prix = priceOf(p);
                      const missing = prix == null;
                      const n = Number(qty[p.product_id]);
                      const filled = Number.isInteger(n) && n > 0 && !missing;
                      const montant = filled ? n * Number(prix) : 0;
                      return (
                        <tr key={p.product_id} style={{
                          background: filled ? 'var(--color-primary-soft)' : (i % 2 ? 'var(--color-hover)' : 'transparent'),
                          borderLeft: filled ? '3px solid var(--color-primary)' : '3px solid transparent',
                          borderBottom: '1px solid var(--color-border)',
                        }}>
                          <td style={{ padding: '7px 14px' }}>
                            <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{p.code}</span>
                            {p.code ? '  ' : ''}<span style={{ fontWeight: filled ? 600 : 400 }}>{p.designation}</span>
                          </td>
                          <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                            {missing
                              ? <span style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>tarif manquant</span>
                              : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(prix)} <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>GNF</span></span>}
                          </td>
                          <td style={{ padding: '6px 14px', textAlign: 'center' }}>
                            <input type="text" inputMode="numeric" value={qty[p.product_id] ?? ''} disabled={missing}
                              onChange={e => setQ(p.product_id, e.target.value)}
                              style={{
                                width: 78, padding: '6px 8px', textAlign: 'center', borderRadius: 7,
                                border: `1.5px solid ${filled ? 'var(--color-primary)' : 'var(--color-border-strong)'}`,
                                background: missing ? 'var(--color-hover)' : 'var(--color-bg)', color: 'var(--color-text)',
                                fontVariantNumeric: 'tabular-nums', fontWeight: filled ? 700 : 400,
                              }} />
                          </td>
                          <td style={{ padding: '7px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: filled ? 700 : 400, color: filled ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                            {montant ? `${fmt(montant)} GNF` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--color-navy)', color: '#fff', fontWeight: 700 }}>
                  <td style={{ padding: '11px 14px' }}>Total · {fmt(totals.lignes)} ligne(s)</td>
                  <td></td>
                  <td style={{ padding: '11px 14px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.q)} {unite}s</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 15 }}>{fmt(totals.montant)} GNF</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {error && <p style={{ color: 'var(--color-danger)', marginTop: 12, fontWeight: 500 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => nav('/commerce/commandes')} disabled={busy}>Annuler</button>
          <button className="btn" onClick={onSaveDraft} disabled={busy}>Enregistrer le brouillon</button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={busy}>Soumettre</button>
        </div>
      </div>
    </div>
  );
}
