import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import { useI18n } from '../../i18n/I18nContext';

// Refonte Stock (Lot 3) — Transferts avec double validation (expédition au départ, réception à
// l'arrivée). Le stock est déplacé via le grand livre. Écart = expédié − reçu. Libellés de statut
// traduits via t('transf.statut.*').
const STATUT_COLOR = { brouillon: '#6b7280', expedie: '#b45309', recu: '#15803d', annule: '#b91c1c' };
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

export default function StockTransferts() {
  const { user } = useAuth();
  const { t } = useI18n();
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
    client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {});
    client.get('/products').then(r => setProducts(r.data)).catch(() => {});
    client.get('/stock-locations').then(r => setLocations(r.data.filter(l => l.actif))).catch(() => {});
  }, [canView]);

  const buProducts = useMemo(() => products.filter(p => !form.business_unit_source || String(p.business_unit_id) === String(form.business_unit_source)), [products, form.business_unit_source]);
  if (!canView) return <div><StockSectionNav /><p>{t('transf.notAllowed')}</p></div>;

  function addLine() {
    if (!newLine.product_id || !(Number(newLine.quantite_demandee) > 0)) return;
    const p = products.find(x => String(x.id) === String(newLine.product_id));
    setLines(ls => [...ls, { product_id: newLine.product_id, quantite_demandee: newLine.quantite_demandee, label: `${p.code ? p.code + ' — ' : ''}${p.designation}` }]);
    setNewLine({ product_id: '', quantite_demandee: '' });
  }
  async function create(e) {
    e.preventDefault(); setError('');
    if (!form.business_unit_source || !form.location_source_id || !form.location_dest_id) { setError(t('transf.reqLoc')); return; }
    if (form.location_source_id === form.location_dest_id) { setError(t('transf.reqDiff')); return; }
    if (!lines.length) { setError(t('transf.reqLine')); return; }
    try {
      await client.post('/stock-transferts', {
        business_unit_source: Number(form.business_unit_source), business_unit_dest: Number(form.business_unit_source),
        location_source_id: Number(form.location_source_id), location_dest_id: Number(form.location_dest_id),
        transporteur: form.transporteur, vehicule: form.vehicule, chauffeur: form.chauffeur,
        lines: lines.map(l => ({ product_id: Number(l.product_id), quantite_demandee: Number(l.quantite_demandee) })),
      });
      setForm({ business_unit_source: '', location_source_id: '', location_dest_id: '', transporteur: '', vehicule: '', chauffeur: '' });
      setLines([]); setShowForm(false); load();
    } catch (err) { setError(err.response?.data?.error || t('login.genericError')); }
  }
  async function openDetail(id) { const { data } = await client.get('/stock-transferts/' + id); setDetail(data); setRecu(Object.fromEntries(data.lines.map(l => [l.id, l.quantite_expediee ?? l.quantite_demandee]))); }
  async function expedier(tr) { if (!window.confirm(t('transf.confirmShip', { ref: tr.reference }))) return; await client.post(`/stock-transferts/${tr.id}/expedier`); load(); if (detail?.id === tr.id) openDetail(tr.id); }
  async function receptionner() { await client.post(`/stock-transferts/${detail.id}/receptionner`, { quantites: recu }); load(); openDetail(detail.id); }

  return (
    <div>
      <StockSectionNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{t('transf.title')}</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{t('transf.subtitle')}</p>
        </div>
        {canAdd && <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setError(''); }}>{showForm ? t('common.cancel') : t('transf.newBtn')}</button>}
      </div>

      {showForm && canAdd && (
        <section className="card" style={{ marginBottom: 12 }}>
          <form onSubmit={create}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label className="field" style={{ minWidth: 160 }}>{t('transf.buSource')}
                <select value={form.business_unit_source} onChange={e => setForm(f => ({ ...f, business_unit_source: e.target.value }))} required>
                  <option value="" disabled>{t('mvtform.choose')}</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                </select>
              </label>
              <label className="field" style={{ minWidth: 160 }}>{t('transf.locSource')}
                <select value={form.location_source_id} onChange={e => setForm(f => ({ ...f, location_source_id: e.target.value }))} required>
                  <option value="" disabled>{t('mvtform.choose')}</option>{locations.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </label>
              <label className="field" style={{ minWidth: 160 }}>{t('transf.locDest')}
                <select value={form.location_dest_id} onChange={e => setForm(f => ({ ...f, location_dest_id: e.target.value }))} required>
                  <option value="" disabled>{t('mvtform.choose')}</option>{locations.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
              <label className="field" style={{ flex: 1, minWidth: 120 }}>{t('transf.carrier')}<input value={form.transporteur} onChange={e => setForm(f => ({ ...f, transporteur: e.target.value }))} /></label>
              <label className="field" style={{ flex: 1, minWidth: 120 }}>{t('transf.vehicle')}<input value={form.vehicule} onChange={e => setForm(f => ({ ...f, vehicule: e.target.value }))} /></label>
              <label className="field" style={{ flex: 1, minWidth: 120 }}>{t('transf.driver')}<input value={form.chauffeur} onChange={e => setForm(f => ({ ...f, chauffeur: e.target.value }))} /></label>
            </div>
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '12px 0', paddingTop: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label className="field" style={{ flex: 1, minWidth: 200 }}>{t('stbord.th.product')}
                  <select value={newLine.product_id} onChange={e => setNewLine(n => ({ ...n, product_id: e.target.value }))} disabled={!form.business_unit_source}>
                    <option value="">{t('mvtform.choose')}</option>{buProducts.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + ' — ' : ''}{p.designation}</option>)}
                  </select>
                </label>
                <label className="field" style={{ width: 130 }}>{t('mvt.th.quantity')}<input type="number" min="0" step="0.001" value={newLine.quantite_demandee} onChange={e => setNewLine(n => ({ ...n, quantite_demandee: e.target.value }))} /></label>
                <button type="button" className="btn btn-secondary" onClick={addLine}>{t('transf.addLine')}</button>
              </div>
              {lines.length > 0 && (
                <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                  {lines.map((l, i) => <li key={i} style={{ fontSize: 14 }}>{l.label} — <strong>{l.quantite_demandee}</strong> <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>×</button></li>)}
                </ul>
              )}
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            <button type="submit" className="btn btn-primary">{t('transf.createBtn')}</button>
          </form>
        </section>
      )}

      {rows.length === 0 && <p className="empty-row">{t('transf.empty')}</p>}
      {rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('mvt.th.ref')}</th><th>{t('mvt.th.date')}</th><th>{t('transf.route')}</th><th className="num">{t('transf.th.lines')}</th><th>{t('mvt.th.status')}</th><th /></tr></thead>
              <tbody>
                {rows.map(tr => (
                    <tr key={tr.id}>
                      <td><strong>{tr.reference}</strong></td>
                      <td>{d10(tr.date_transfert)}</td>
                      <td>{tr.loc_source_nom} → {tr.loc_dest_nom}</td>
                      <td className="num">{tr.n_lignes}</td>
                      <td><span style={{ color: STATUT_COLOR[tr.statut] || '#6b7280', fontWeight: 700 }}>{t('transf.statut.' + tr.statut)}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => openDetail(tr.id)}>{t('mvt.detail')}</button>
                        {canEdit && tr.statut === 'brouillon' && <button className="btn btn-primary btn-sm" onClick={() => expedier(tr)}>{t('transf.ship')}</button>}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <section className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{detail.reference} — {detail.loc_source_nom} → {detail.loc_dest_nom}</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setDetail(null)}>{t('mvt.close')}</button>
          </div>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 10px' }}>{t('transf.statut.' + detail.statut)} · {d10(detail.date_transfert)}{detail.transporteur ? ` · ${detail.transporteur}` : ''}{detail.chauffeur ? ` · ${detail.chauffeur}` : ''}</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('stbord.th.product')}</th><th className="num">{t('transf.th.requested')}</th><th className="num">{t('transf.th.shipped')}</th><th className="num">{detail.statut === 'expedie' && canEdit ? t('transf.th.receivedInput') : t('transf.th.received')}</th><th className="num">{t('stockreleve.th.ecart')}</th></tr></thead>
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
            <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={receptionner}>{t('transf.confirmReceipt')}</button>
          )}
        </section>
      )}
    </div>
  );
}
