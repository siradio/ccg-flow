import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';

// Refonte Stock (Lot 3) — Inventaires physiques. Le théorique est figé à la création ; la saisie du
// physique calcule l'écart ; la validation génère les mouvements d'ajustement.
const STATUT = { en_cours: { l: 'En cours', c: '#b45309' }, valide: { l: 'Validé', c: '#15803d' }, annule: { l: 'Annulé', c: '#b91c1c' } };
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const fmt = n => (n == null ? '' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

export default function StockInventaires() {
  const { user } = useAuth();
  const canView = hasSubModuleLevel(user, 'stock.inventaires');
  const canAdd = hasSubModuleLevel(user, 'stock.inventaires', 'ajout');
  const canEdit = hasSubModuleLevel(user, 'stock.inventaires', 'edition');

  const [rows, setRows] = useState([]);
  const [bus, setBus] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({ business_unit_id: '', location_id: '' });
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [saisie, setSaisie] = useState({});
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() { client.get('/stock-inventaires').then(r => setRows(r.data)).catch(() => {}); }
  useEffect(() => {
    if (!canView) return;
    load();
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
    client.get('/stock-locations').then(r => setLocations(r.data.filter(l => l.actif))).catch(() => {});
  }, [canView]);
  if (!canView) return <div><StockSectionNav /><p>Les inventaires ne vous ont pas été accordés.</p></div>;

  async function create(e) {
    e.preventDefault(); setError('');
    if (!form.business_unit_id || !form.location_id) { setError('BU et localisation requises.'); return; }
    try {
      const { data } = await client.post('/stock-inventaires', { business_unit_id: Number(form.business_unit_id), location_id: Number(form.location_id) });
      setForm({ business_unit_id: '', location_id: '' }); setShowForm(false); load(); openDetail(data.id);
    } catch (err) { setError(err.response?.data?.error || 'Erreur.'); }
  }
  async function openDetail(id) {
    const { data } = await client.get('/stock-inventaires/' + id); setDetail(data); setMsg('');
    setSaisie(Object.fromEntries(data.lines.map(l => [l.id, { stock_physique: l.stock_physique ?? '', motif: l.motif ?? '' }])));
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  async function saveSaisie() {
    const lines = Object.entries(saisie).filter(([, v]) => v.stock_physique !== '').map(([id, v]) => ({ id: Number(id), stock_physique: Number(v.stock_physique), motif: v.motif }));
    await client.put(`/stock-inventaires/${detail.id}/lines`, { lines }); setMsg('Saisie enregistrée.'); openDetail(detail.id);
  }
  async function valider() {
    if (!window.confirm('Valider l\'inventaire ? Les écarts génèreront des mouvements d\'ajustement.')) return;
    const { data } = await client.post(`/stock-inventaires/${detail.id}/valider`); setMsg(`Inventaire validé — ${data.ajustements} ajustement(s) généré(s).`); load(); openDetail(detail.id);
  }

  return (
    <div>
      <StockSectionNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Inventaires physiques</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>Comptage physique, calcul des écarts et génération automatique des ajustements.</p>
        </div>
        {canAdd && <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setError(''); }}>{showForm ? 'Annuler' : '+ Nouvel inventaire'}</button>}
      </div>

      {showForm && canAdd && (
        <section className="card" style={{ marginBottom: 12 }}>
          <form onSubmit={create} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ minWidth: 170 }}>Business Unit *
              <select value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value }))} required>
                <option value="" disabled>Choisir…</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
            <label className="field" style={{ minWidth: 170 }}>Localisation *
              <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))} required>
                <option value="" disabled>Choisir…</option>{locations.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
            </label>
            {error && <div className="alert alert-danger" style={{ width: '100%' }}>{error}</div>}
            <button type="submit" className="btn btn-primary">Créer (fige le stock théorique)</button>
          </form>
        </section>
      )}

      {rows.length === 0 && <p className="empty-row">Aucun inventaire.</p>}
      {rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Réf.</th><th>Date</th><th>BU</th><th>Localisation</th><th className="num">Lignes</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {rows.map(i => {
                  const s = STATUT[i.statut] || {};
                  return (
                    <tr key={i.id}>
                      <td><strong>{i.reference}</strong></td><td>{d10(i.date_inventaire)}</td><td>{i.bu_nom}</td><td>{i.location_nom}</td>
                      <td className="num">{i.n_lignes}</td><td><span style={{ color: s.c, fontWeight: 700 }}>{s.l}</span></td>
                      <td><button className="btn btn-secondary btn-sm" onClick={() => openDetail(i.id)}>Ouvrir</button></td>
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
            <h2 style={{ margin: 0 }}>{detail.reference} — {detail.location_nom}</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setDetail(null)}>Fermer</button>
          </div>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 10px' }}>{(STATUT[detail.statut] || {}).l} · {detail.bu_nom} · {d10(detail.date_inventaire)}</p>
          {msg && <div className="alert alert-success" style={{ marginBottom: 10 }}>{msg}</div>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Produit</th><th className="num">Théorique</th><th className="num">Physique</th><th className="num">Écart</th><th>Motif</th></tr></thead>
              <tbody>
                {detail.lines.map(l => {
                  const enCours = detail.statut === 'en_cours' && canEdit;
                  const phys = enCours ? saisie[l.id]?.stock_physique : l.stock_physique;
                  const ecart = phys === '' || phys == null ? null : Number(phys) - Number(l.stock_theorique);
                  return (
                    <tr key={l.id}>
                      <td>{l.product_code ? l.product_code + ' — ' : ''}{l.designation}</td>
                      <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(l.stock_theorique)}</td>
                      <td className="num">
                        {enCours
                          ? <input type="number" step="0.001" value={saisie[l.id]?.stock_physique ?? ''} onChange={e => setSaisie(s => ({ ...s, [l.id]: { ...s[l.id], stock_physique: e.target.value } }))} style={{ width: 90 }} />
                          : fmt(l.stock_physique)}
                      </td>
                      <td className="num" style={{ fontWeight: 600, color: ecart == null ? 'inherit' : ecart === 0 ? '#15803d' : '#b91c1c' }}>{ecart == null ? '—' : (ecart > 0 ? '+' : '') + fmt(ecart)}</td>
                      <td>{enCours
                        ? <input value={saisie[l.id]?.motif ?? ''} onChange={e => setSaisie(s => ({ ...s, [l.id]: { ...s[l.id], motif: e.target.value } }))} placeholder="optionnel" style={{ width: 140 }} />
                        : (l.motif || '—')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {detail.statut === 'en_cours' && canEdit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={saveSaisie}>Enregistrer la saisie</button>
              <button className="btn btn-primary" onClick={valider}>Valider l'inventaire</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
