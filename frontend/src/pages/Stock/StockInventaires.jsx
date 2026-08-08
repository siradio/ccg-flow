import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import { useI18n } from '../../i18n/I18nContext';

// Refonte Stock (Lot 3) — Inventaires physiques. Le théorique est figé à la création ; la saisie du
// physique calcule l'écart ; la validation génère les mouvements d'ajustement. Statut traduit via
// t('inv.statut.*').
const STATUT_COLOR = { en_cours: '#b45309', valide: '#15803d', annule: '#b91c1c' };
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const fmt = n => (n == null ? '' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

export default function StockInventaires() {
  const { user } = useAuth();
  const { t } = useI18n();
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
    client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {});
    client.get('/stock-locations').then(r => setLocations(r.data.filter(l => l.actif))).catch(() => {});
  }, [canView]);
  if (!canView) return <div><StockSectionNav /><p>{t('inv.notAllowed')}</p></div>;

  async function create(e) {
    e.preventDefault(); setError('');
    if (!form.business_unit_id || !form.location_id) { setError(t('inv.reqBuLoc')); return; }
    try {
      const { data } = await client.post('/stock-inventaires', { business_unit_id: Number(form.business_unit_id), location_id: Number(form.location_id) });
      setForm({ business_unit_id: '', location_id: '' }); setShowForm(false); load(); openDetail(data.id);
    } catch (err) { setError(err.response?.data?.error || t('login.genericError')); }
  }
  async function openDetail(id) {
    const { data } = await client.get('/stock-inventaires/' + id); setDetail(data); setMsg('');
    setSaisie(Object.fromEntries(data.lines.map(l => [l.id, { stock_physique: l.stock_physique ?? '', motif: l.motif ?? '' }])));
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  async function saveSaisie() {
    const lines = Object.entries(saisie).filter(([, v]) => v.stock_physique !== '').map(([id, v]) => ({ id: Number(id), stock_physique: Number(v.stock_physique), motif: v.motif }));
    await client.put(`/stock-inventaires/${detail.id}/lines`, { lines }); setMsg(t('inv.saved')); openDetail(detail.id);
  }
  async function valider() {
    if (!window.confirm(t('inv.confirmValidate'))) return;
    const { data } = await client.post(`/stock-inventaires/${detail.id}/valider`); setMsg(t('inv.validated', { n: data.ajustements })); load(); openDetail(detail.id);
  }

  return (
    <div>
      <StockSectionNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{t('inv.title')}</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{t('inv.subtitle')}</p>
        </div>
        {canAdd && <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setError(''); }}>{showForm ? t('common.cancel') : t('inv.newBtn')}</button>}
      </div>

      {showForm && canAdd && (
        <section className="card" style={{ marginBottom: 12 }}>
          <form onSubmit={create} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ minWidth: 170 }}>{t('mvtform.bu')}
              <select value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value }))} required>
                <option value="" disabled>{t('mvtform.choose')}</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
            <label className="field" style={{ minWidth: 170 }}>{t('inv.locStar')}
              <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))} required>
                <option value="" disabled>{t('mvtform.choose')}</option>{locations.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
            </label>
            {error && <div className="alert alert-danger" style={{ width: '100%' }}>{error}</div>}
            <button type="submit" className="btn btn-primary">{t('inv.createBtn')}</button>
          </form>
        </section>
      )}

      {rows.length === 0 && <p className="empty-row">{t('inv.empty')}</p>}
      {rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('mvt.th.ref')}</th><th>{t('mvt.th.date')}</th><th>{t('stockreleve.th.bu')}</th><th>{t('stockactuel.th.location')}</th><th className="num">{t('transf.th.lines')}</th><th>{t('mvt.th.status')}</th><th /></tr></thead>
              <tbody>
                {rows.map(i => (
                    <tr key={i.id}>
                      <td><strong>{i.reference}</strong></td><td>{d10(i.date_inventaire)}</td><td>{i.bu_nom}</td><td>{i.location_nom}</td>
                      <td className="num">{i.n_lignes}</td><td><span style={{ color: STATUT_COLOR[i.statut] || '#6b7280', fontWeight: 700 }}>{t('inv.statut.' + i.statut)}</span></td>
                      <td><button className="btn btn-secondary btn-sm" onClick={() => openDetail(i.id)}>{t('inv.open')}</button></td>
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
            <h2 style={{ margin: 0 }}>{detail.reference} — {detail.location_nom}</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setDetail(null)}>{t('mvt.close')}</button>
          </div>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 10px' }}>{t('inv.statut.' + detail.statut)} · {detail.bu_nom} · {d10(detail.date_inventaire)}</p>
          {msg && <div className="alert alert-success" style={{ marginBottom: 10 }}>{msg}</div>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('stbord.th.product')}</th><th className="num">{t('stockreleve.th.theo')}</th><th className="num">{t('inv.th.physical')}</th><th className="num">{t('stockreleve.th.ecart')}</th><th>{t('inv.th.reason')}</th></tr></thead>
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
                        ? <input value={saisie[l.id]?.motif ?? ''} onChange={e => setSaisie(s => ({ ...s, [l.id]: { ...s[l.id], motif: e.target.value } }))} placeholder={t('stockreleve.optional')} style={{ width: 140 }} />
                        : (l.motif || '—')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {detail.statut === 'en_cours' && canEdit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={saveSaisie}>{t('inv.saveEntry')}</button>
              <button className="btn btn-primary" onClick={valider}>{t('inv.validateBtn')}</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
