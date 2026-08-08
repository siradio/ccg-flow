import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel, isSuperAdmin } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import { ExportButtons } from '../../utils/exportData';
import { useI18n } from '../../i18n/I18nContext';

const EXPORT_COLS = [
  { key: 'product_code', label: 'Code' }, { key: 'designation', label: 'Désignation' },
  { key: 'numero_lot', label: 'Lot' }, { key: 'bu_nom', label: 'Business Unit' },
  { key: 'location_nom', label: 'Localisation' }, { key: 'quantite_restante', label: 'Reste', type: 'number' },
  { key: 'date_fabrication', label: 'Fabrication', type: 'date' }, { key: 'date_peremption', label: 'Péremption', type: 'date' },
  { key: 'jours_avant_peremption', label: 'Jours restants', type: 'number' },
];

// Refonte Stock (Lot 2) — Lots & péremption. Quantité restante dérivée du grand livre. Statut de
// péremption calculé côté client. Panneau de configuration des alertes email (super_admin).
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

// Couleurs du badge de péremption ; le libellé est calculé au rendu (traduit).
function peremptionColor(l) {
  if (!l.date_peremption) return { c: '#6b7280', b: 'transparent' };
  const j = Number(l.jours_avant_peremption);
  if (j <= 7) return { c: '#b91c1c', b: '#fee2e2' };
  if (j <= 30) return { c: '#b45309', b: '#fef3c7' };
  return { c: '#15803d', b: '#dcfce7' };
}

const emptyLot = () => ({ product_id: '', numero_lot: '', date_fabrication: '', date_peremption: '', quantite_initiale: '', location_id: '', statut_qualite: '' });

export default function StockLots() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canView = hasSubModuleLevel(user, 'stock.consultation');
  const canAdd = hasSubModuleLevel(user, 'stock.consultation', 'ajout');
  const admin = isSuperAdmin(user);

  const [lots, setLots] = useState([]);
  const [bus, setBus] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [filterBu, setFilterBu] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [lot, setLot] = useState(emptyLot());
  const [error, setError] = useState('');
  const [cfg, setCfg] = useState(null);
  const [cfgMsg, setCfgMsg] = useState('');

  function load() {
    const qs = filterBu ? `?business_unit_id=${filterBu}` : '';
    client.get('/stock-lots' + qs).then(r => setLots(r.data)).catch(() => {});
  }
  useEffect(() => {
    if (!canView) return;
    client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {});
    client.get('/products').then(r => setProducts(r.data)).catch(() => {});
    client.get('/stock-locations').then(r => setLocations(r.data.filter(l => l.actif))).catch(() => {});
    if (admin) client.get('/stock-lots/alert-config').then(r => setCfg(r.data)).catch(() => {});
  }, [canView, admin]);
  useEffect(() => { if (canView) load(); /* eslint-disable-next-line */ }, [canView, filterBu]);

  const lotProducts = useMemo(() => products.filter(p => p.gere_par_lot), [products]);

  if (!canView) return <div><StockSectionNav /><p>{t('stockactuel.notAllowed')}</p></div>;

  async function createLot(e) {
    e.preventDefault(); setError('');
    if (!lot.product_id || !lot.numero_lot.trim()) { setError(t('lots.required')); return; }
    try {
      await client.post('/stock-lots', {
        product_id: Number(lot.product_id), numero_lot: lot.numero_lot, date_fabrication: lot.date_fabrication || null,
        date_peremption: lot.date_peremption || null, quantite_initiale: lot.quantite_initiale === '' ? null : Number(lot.quantite_initiale),
        location_id: lot.location_id ? Number(lot.location_id) : null, statut_qualite: lot.statut_qualite || null,
      });
      setLot(emptyLot()); setShowForm(false); load();
    } catch (err) { setError(err.response?.data?.error || t('login.genericError')); }
  }

  async function saveCfg() {
    setCfgMsg('');
    await client.put('/stock-lots/alert-config', { actif: cfg.actif, jours: Number(cfg.jours) || 30, emails: cfg.emails });
    setCfgMsg(t('lots.cfgSaved'));
  }
  async function sendNow() {
    setCfgMsg(t('login.sending'));
    try { const { data } = await client.post('/stock-lots/alert-config/test'); setCfgMsg(data.sent ? t('lots.sent', { n: data.count }) : t('lots.noneToReport')); }
    catch (err) { setCfgMsg(err.response?.data?.error || t('lots.sendFail')); }
  }

  return (
    <div>
      <StockSectionNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{t('lots.title')}</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{t('lots.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ExportButtons filename="lots_stock" columns={EXPORT_COLS} rows={lots} />
          {canAdd && <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setError(''); }}>{showForm ? t('common.cancel') : t('lots.newLot')}</button>}
        </div>
      </div>

      {showForm && canAdd && (
        <section className="card" style={{ marginBottom: 12 }}>
          <form onSubmit={createLot} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ minWidth: 200 }}>{t('lots.productLot')}
              <select value={lot.product_id} onChange={e => setLot(l => ({ ...l, product_id: e.target.value }))} required>
                <option value="" disabled>{t('mvtform.choose')}</option>
                {lotProducts.map(p => <option key={p.id} value={p.id}>{p.code ? p.code + ' — ' : ''}{p.designation}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 150 }}>{t('lot.number')}<input value={lot.numero_lot} onChange={e => setLot(l => ({ ...l, numero_lot: e.target.value }))} required /></label>
            <label className="field" style={{ width: 150 }}>{t('lots.mfg')}<input type="date" value={lot.date_fabrication} onChange={e => setLot(l => ({ ...l, date_fabrication: e.target.value }))} /></label>
            <label className="field" style={{ width: 150 }}>{t('lots.exp')}<input type="date" value={lot.date_peremption} onChange={e => setLot(l => ({ ...l, date_peremption: e.target.value }))} /></label>
            <label className="field" style={{ width: 150 }}>{t('mvtform.location')}
              <select value={lot.location_id} onChange={e => setLot(l => ({ ...l, location_id: e.target.value }))}>
                <option value="">—</option>{locations.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
              </select>
            </label>
            {error && <div className="alert alert-danger" style={{ width: '100%' }}>{error}</div>}
            <button type="submit" className="btn btn-primary">{t('lots.createBtn')}</button>
          </form>
        </section>
      )}

      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 160 }}>{t('stockcommon.bu')}
          <select value={filterBu} onChange={e => setFilterBu(e.target.value)}>
            <option value="">{t('stockcommon.all')}</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
      </div>

      {lots.length === 0 && <p className="empty-row">{t('lots.empty')}</p>}
      {lots.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('stbord.th.product')}</th><th>{t('stbord.th.batch')}</th><th>{t('stockreleve.th.bu')}</th><th>{t('stockactuel.th.location')}</th><th className="num">{t('stbord.th.remaining')}</th><th>{t('lots.th.mfg')}</th><th>{t('lots.th.exp')}</th><th>{t('stbord.th.deadline')}</th></tr></thead>
              <tbody>
                {lots.map(l => {
                  const badge = peremptionColor(l);
                  const j = Number(l.jours_avant_peremption);
                  const badgeLabel = !l.date_peremption ? '—' : (j < 0 ? t('lots.expired', { n: -j }) : t('stbord.days', { n: j }));
                  return (
                    <tr key={l.id}>
                      <td><strong>{l.product_code || ''}</strong>{l.product_code ? ' — ' : ''}{l.designation}</td>
                      <td>{l.numero_lot}</td>
                      <td>{l.bu_nom || '—'}</td>
                      <td>{l.location_nom || '—'}</td>
                      <td className="num" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(l.quantite_restante)} {l.unite || ''}</td>
                      <td>{d10(l.date_fabrication)}</td>
                      <td>{d10(l.date_peremption)}</td>
                      <td><span style={{ background: badge.b, color: badge.c, fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 999 }}>{badgeLabel}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {admin && cfg && (
        <section className="card" style={{ marginTop: 16, maxWidth: 620 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>{t('lots.alertTitle')}</h2>
          <p style={{ margin: '0 0 12px', color: 'var(--color-text-muted)', fontSize: 13 }}>{t('lots.alertDesc')}</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
            <input type="checkbox" checked={!!cfg.actif} onChange={e => setCfg(c => ({ ...c, actif: e.target.checked }))} /> {t('lots.enableAlerts')}
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ width: 170 }}>{t('lots.anticipation')}
              <input type="number" min="1" value={cfg.jours} onChange={e => setCfg(c => ({ ...c, jours: e.target.value }))} />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 200 }}>{t('lots.recipients')}
              <input value={cfg.emails} onChange={e => setCfg(c => ({ ...c, emails: e.target.value }))} placeholder="a@ccg.com, b@ccg.com" />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={saveCfg}>{t('common.save')}</button>
            <button className="btn btn-secondary btn-sm" onClick={sendNow}>{t('lots.sendNow')}</button>
            {cfgMsg && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{cfgMsg}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
