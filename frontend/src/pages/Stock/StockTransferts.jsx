import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';

// Refonte Stock (Lot 3) — Transferts avec double validation (expédition au départ, réception à
// l'arrivée). Le stock est déplacé via le grand livre. Écart = expédié − reçu.
const STATUT = { brouillon: { l: 'Brouillon', c: '#6b7280' }, expedie: { l: 'Expédié', c: '#b45309' }, recu: { l: 'Reçu', c: '#15803d' }, annule: { l: 'Annulé', c: '#b91c1c' } };
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

export default function StockTransferts() {
  const { user } = useAuth();
  const canView = hasSubModuleLevel(user, 'stock.transferts');
  const canAdd = hasSubModuleLevel(user, 'stock.transferts', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'stock.transferts', 'edition');

  const [rows, setRows] = useState([]);
  const [bus, setBus] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ business_unit_source: '', location_source_id: '', location_dest_id: '', transporteur: '', vehicule: '', chauffeur: '' });
  const [lines, setLines] = useState([]);
  const [newLine, setNewLine] = useState({ product_id: '', quantite_demandee: '' });
  const [detail, setDetail] = useState(null);
  const [recu, setRecu] = useState({});
  const [error, setError] = useState('');

  function load() { client.get('/stock-transferts').then(r => setRows(r.data)).catch(() => {}); }
  useEffect(() => {
    if (!canView) return;
    load();
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
    client.get('/products').then(r => setProducts(r.data)).catch(() => {});
    client.get('/stock-locations').then(r => setLocations(r.data.filter(l => l.actif))).catch(() => {});
  }, [canView]);

  const buProducts = useMemo(() => products.filter(p => !form.business_unit_source || String(p.business_unit_id) === String(form.business_unit_source)), [products, form.business_unit_source]);
  if (!canView) return <div><StockSectionNav /><p>Les transferts ne vous ont pas été accordés.</p></div>;

  function addLine() {
    if (!newLine.product_id || !(Number(newLine.quantite_demandee) > 0)) return;
    const p = products.find(x => String(x.id) === String(newLine.product_id));
    setLines(ls => [...ls, { product_id: newLine.product_id, quantite_demandee: newLine.quantite_demandee, label: `${p.code ? p.code + ' — ' : ''}${p.designation}` }]);
    setNewLine({ product_id: '', quantite_demandee: '' });
  }
  async function create(e) {
    e.preventDefault(); setError('');
    if (!form.business_unit_source || !form.location_source_id || !form.location_dest_id) { setError('BU source et localisations requises.'); return; }
    if (form.location_source_id === form.location_dest_id) { setError('Source et destination doivent différer.'); return; }
    if (!lines.length) { setError('Ajoutez au moins une ligne.'); return; }
    try {
      await client.post('/stock-transferts', {
        business_unit_source: Number(form.business_unit_source), business_unit_dest: Number(form.business_unit_source),
        location_source_id: Number(form.location_source_id), location_dest_id: Number(form.location_dest_id),
        transporteur: form.transporteur, vehicule: form.vehicule, chauffeur: form.chauffeur,
        lines: lines.map(l => ({ product_id: Number(l.product_id), quantite_demandee: Number(l.quantite_demandee) })),
      });
      setForm({ business_unit_source: '', location_source_id: '', location_dest_id: '', transporteur: '', vehicule: '', chauffeur: '' });
      setLines([]); setShowForm(false); load();
    } catch (err) { setError(err.response?.data?.error || 'Erreur.'); }
  }
  async function openDetail(id) { const { data } = await client.get('/stock-transferts/' + id); setDetail(data); setRecu(Object.fromEntries(data.lines.map(l => [l.id, l.quantite_expediee ?? l.quantite_demandee]))); }
  async function expedier(t) { if (!window.confirm(`Expédier ${t.reference} ? Le stock sortira de la source.`)) return; await client.post(`/stock-transferts/${t.id}/expedier`); load(); if (detail?.id === t.id) openDetail(t.id); }
  async function receptionner() { await client.post(`/stock-transferts/${detail.id}/receptionner`, { quantites: recu }); load(); openDetail(detail.id); }

  return (
    <div>
      <StockSectionNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Transferts de stock</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>Déplacement entre localisations avec validation au départ et à l'arrivée.</p>
        </div>
        {canAdd && <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setError(''); }}>{showForm ? 'Annuler' : '+ Nouveau transfert'}</button>}
      </div>

      {showForm && canAdd && (
        <section className="card" style={{ marginBottom: 12 }}>
          <form onSubmit={create}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label className="field" style={{ minWidth: 160 }}>BU source *
                <select value={form.business_unit_source} onChange={e => setForm(f => ({ ...f, business_unit_source: e.target.value }))} required>
                  <option value="" disabled>Choisir…</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                </select>
              </label>
              <label className="field" style={{ minWidth: 160 }}>Localisation source *
                <select value={form.location_source_id} onChange={e => setForm(f => ({ ...f, location_source_id: e.target.value }))} required>
                  <option value="" disabled>Choisir…</option>{locations.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </label>
              <label className="field" style={{ minWidth: 160 }}>Localisation destination *
                <select value={form.location_dest_id} onChange={e => setForm(f => ({ ...f, location_dest_id: e.target.value }))} required>
                  <option value="" disabled>Choisir…</option>{locations.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
              <label className="field" style={{ flex: 1, minWidth: 120 }}>Transporteur<input value={form.transporteur} onChange={e => setForm(f => ({ ...f, transporteur: e.target.value }))} /></label>
              <label className="field" style={{ flex: 1, minWidth: 120 }}>Véhicule<input value={form.vehicule} onChange={e => setForm(f => ({ ...f, vehicule: e.target.value }))} /></label>
              <label className="field" style={{ flex: 1, minWidth: 120 }}>Chauffeur<input value={form.chauffeur} onChange={e => setForm(f => ({ ...f, chauffeur: e.target.value }))} /></label>
            </div>
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '12px 0', paddingTop: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label className="field" style={{ flex: 1, minWidth: 200 }}>Produit
                  <select value={newLine.product_id} onChange={e => setNewLine(n => ({ ...n, product_id: e.target.value }))} disabled={!form.business_unit_source}>
                    <option value="">Choisir…</option>{buProducts.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + ' — ' : ''}{p.designation}</option>)}
                  </select>
                </label>
                <label className="field" style={{ width: 130 }}>Quantité<input type="number" min="0" step="0.001" value={newLine.quantite_demandee} onChange={e => setNewLine(n => ({ ...n, quantite_demandee: e.target.value }))} /></label>
                <button type="button" className="btn btn-secondary" onClick={addLine}>Ajouter la ligne</button>
              </div>
              {lines.length > 0 && (
                <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                  {lines.map((l, i) => <li key={i} style={{ fontSize: 14 }}>{l.label} — <strong>{l.quantite_demandee}</strong> <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>×</button></li>)}
                </ul>
              )}
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            <button type="submit" className="btn btn-primary">Créer le transfert</button>
          </form>
        </section>
      )}

      {rows.length === 0 && <p className="empty-row">Aucun transfert.</p>}
      {rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Réf.</th><th>Date</th><th>Source → Destination</th><th className="num">Lignes</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {rows.map(t => {
                  const s = STATUT[t.statut] || {};
                  return (
                    <tr key={t.id}>
                      <td><strong>{t.reference}</strong></td>
                      <td>{d10(t.date_transfert)}</td>
                      <td>{t.loc_source_nom} → {t.loc_dest_nom}</td>
                      <td className="num">{t.n_lignes}</td>
                      <td><span style={{ color: s.c, fontWeight: 700 }}>{s.l}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => openDetail(t.id)}>Détail</button>
                        {canEdit && t.statut === 'brouillon' && <button className="btn btn-primary btn-sm" onClick={() => expedier(t)}>Expédier</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <section className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{detail.reference} — {detail.loc_source_nom} → {detail.loc_dest_nom}</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setDetail(null)}>Fermer</button>
          </div>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 10px' }}>{(STATUT[detail.statut] || {}).l} · {d10(detail.date_transfert)}{detail.transporteur ? ` · ${detail.transporteur}` : ''}{detail.chauffeur ? ` · ${detail.chauffeur}` : ''}</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Produit</th><th className="num">Demandé</th><th className="num">Expédié</th><th className="num">{detail.statut === 'expedie' && canEdit ? 'Reçu (à saisir)' : 'Reçu'}</th><th className="num">Écart</th></tr></thead>
              <tbody>
                {detail.lines.map(l => (
                  <tr key={l.id}>
                    <td>{l.product_code ? l.product_code + ' — ' : ''}{l.designation}</td>
                    <td className="num">{fmt(l.quantite_demandee)}</td>
                    <td className="num">{fmt(l.quantite_expediee)}</td>
                    <td className="num">
                      {detail.statut === 'expedie' && canEdit
                        ? <input type="number" min="0" step="0.001" value={recu[l.id] ?? ''} onChange={e => setRecu(r => ({ ...r, [l.id]: e.target.value }))} style={{ width: 90 }} />
                        : fmt(l.quantite_recue)}
                    </td>
                    <td className="num" style={{ color: l.quantite_recue != null && Number(l.quantite_expediee) !== Number(l.quantite_recue) ? '#b91c1c' : 'inherit' }}>
                      {l.quantite_recue != null ? fmt(Number(l.quantite_expediee) - Number(l.quantite_recue)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.statut === 'expedie' && canEdit && (
            <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={receptionner}>Confirmer la réception</button>
          )}
        </section>
      )}
    </div>
  );
}
