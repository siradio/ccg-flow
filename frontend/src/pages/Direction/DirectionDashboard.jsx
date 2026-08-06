import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import { useI18n } from '../../i18n/I18nContext';

// Tableau de bord Direction (vue exécutive DG). Agrège stock produits finis, production de la veille,
// ventes (à venir), logistique, achats et RH via /api/direction/dashboard. Les rubriques affichées
// sont personnalisables (mémorisé dans le navigateur) — ex. masquer Logistique si non déployée.
const BU_COLORS = ['#2454e0', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0891b2'];
// Clés des rubriques/indicateurs (les libellés sont traduits au rendu via t('cockpit.rub.*') /
// t('cockpit.kpi.*')). L'ordre définit l'ordre d'affichage des onglets.
const RUBRIQUES = ['achats', 'stock', 'production', 'ventes', 'logistique', 'rh'];
const PREF_KEY = 'direction_rubriques';
const HERO_KPIS = ['stock', 'production', 'achats', 'rh'];
const HERO_KEY = 'direction_hero';

const nf = n => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
function money(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' Md';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
  return nf(v);
}
const longDate = (lang) => new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);
const fmtBucket = (g, b) => {
  const s = String(b).slice(0, 10);
  if (g === 'mois') { const [y, m] = s.split('-'); return `${m}/${y}`; }
  return s.split('-').slice(1).reverse().join('/');
};

function PeriodControl({ value, onChange, range, onRange }) {
  const { t } = useI18n();
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ fontSize: 12.5 }}>
        <option value="jour">{t('cockpit.period.day')}</option>
        <option value="semaine">{t('cockpit.period.week')}</option>
        <option value="mois">{t('cockpit.period.month')}</option>
        <option value="personnalise">{t('cockpit.period.custom')}</option>
      </select>
      {value === 'personnalise' && (
        <>
          <input type="date" value={range.from} onChange={e => onRange({ ...range, from: e.target.value })} style={{ fontSize: 12.5 }} />
          <input type="date" value={range.to} onChange={e => onRange({ ...range, to: e.target.value })} style={{ fontSize: 12.5 }} />
        </>
      )}
    </div>
  );
}

function loadPrefs() {
  try { return { ...Object.fromEntries(RUBRIQUES.map(k => [k, true])), ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch { return Object.fromEntries(RUBRIQUES.map(k => [k, true])); }
}
function loadHeroPrefs() {
  try { return { ...Object.fromEntries(HERO_KPIS.map(k => [k, true])), ...JSON.parse(localStorage.getItem(HERO_KEY) || '{}') }; }
  catch { return Object.fromEntries(HERO_KPIS.map(k => [k, true])); }
}

function Delta({ value }) {
  if (value === 0 || value == null) return null;
  const up = value > 0;
  return <span style={{ fontSize: 13, fontWeight: 700, color: up ? '#16f0a3' : '#ffb4b4' }}>{up ? '▲' : '▼'} {up ? '+' : ''}{nf(value)}</span>;
}

function HeroStat({ label, value, sub }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: '16px 20px', minWidth: 190, backdropFilter: 'blur(4px)' }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ModuleCard({ title, to, accent, children }) {
  const { t } = useI18n();
  return (
    <section className="card" style={{ borderTop: `3px solid ${accent}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, letterSpacing: '.01em' }}>{title}</h2>
        {to && <Link to={to} style={{ fontSize: 12.5, color: accent, fontWeight: 600, textDecoration: 'none' }}>{t('cockpit.open')}</Link>}
      </div>
      {children}
    </section>
  );
}

function StatRow({ items }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {items.map(it => (
        <div key={it.label} style={{ flex: '1 1 auto', minWidth: 84 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: it.color || 'inherit', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{it.value}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
const pill = (txt, on, colorBg, colorFg) => (
  <span style={{ background: on ? colorBg : 'var(--color-primary-soft)', color: on ? colorFg : 'var(--color-text-muted)', fontWeight: 700, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{txt}</span>
);

export default function DirectionDashboard() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canView = hasSubModuleLevel(user, 'direction');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [heroPrefs, setHeroPrefs] = useState(loadHeroPrefs);
  const [showPrefs, setShowPrefs] = useState(false);
  const [activeTab, setActiveTab] = useState('stock');
  const [gran, setGran] = useState({ stock: 'semaine', production: 'semaine', rh: 'mois' });
  const [customRange, setCustomRange] = useState({ stock: { from: '', to: today() }, production: { from: '', to: today() }, rh: { from: '', to: today() } });
  const [series, setSeries] = useState({});
  const [bus, setBus] = useState([]);
  const [buFilter, setBuFilter] = useState({ stock: '', production: '' });

  useEffect(() => {
    if (!canView) return;
    client.get('/direction/dashboard').then(r => setD(r.data)).catch(() => setErr(true));
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, [canView]);

  function periodParams(rub) {
    const g = gran[rub]; const t = today();
    if (g === 'personnalise') return { granularity: 'jour', from: customRange[rub].from, to: customRange[rub].to || t };
    if (g === 'jour') { const dt = new Date(); dt.setDate(dt.getDate() - 30); return { granularity: 'jour', from: dt.toISOString().slice(0, 10), to: t }; }
    if (g === 'mois') { const dt = new Date(); dt.setMonth(dt.getMonth() - 11); return { granularity: 'mois', from: dt.toISOString().slice(0, 10), to: t }; }
    const dt = new Date(); dt.setDate(dt.getDate() - 83); return { granularity: 'semaine', from: dt.toISOString().slice(0, 10), to: t };
  }
  useEffect(() => {
    if (!canView || !['stock', 'production', 'rh'].includes(activeTab)) return;
    const p = periodParams(activeTab);
    if (!p.from) return;
    const bu = buFilter[activeTab];
    client.get(`/direction/evolution?rubrique=${activeTab}&granularity=${p.granularity}&date_from=${p.from}&date_to=${p.to}${bu ? `&business_unit_id=${bu}` : ''}`)
      .then(r => setSeries(s => ({ ...s, [activeTab]: r.data }))).catch(() => {});
    // eslint-disable-next-line
  }, [canView, activeTab, gran, customRange, buFilter]);

  function toggle(k) {
    setPrefs(p => { const next = { ...p, [k]: !p[k] }; localStorage.setItem(PREF_KEY, JSON.stringify(next)); return next; });
  }
  function toggleHero(k) {
    setHeroPrefs(p => { const next = { ...p, [k]: !p[k] }; localStorage.setItem(HERO_KEY, JSON.stringify(next)); return next; });
  }

  if (!canView) return <p>{t('cockpit.notAllowed')}</p>;
  if (err) return <p className="empty-row">{t('cockpit.loadError')}</p>;
  if (!d) return <Loading />;

  const prodDelta = d.production.hier - d.production.avantHier;
  const stockEvoData = (series.stock ?? d.stock.evolution ?? []).map(e => ({ x: fmtBucket(gran.stock, e.bucket), valeur: e.valeur }));
  const prodEvoData = (series.production ?? d.production.evolution ?? []).map(e => ({ x: fmtBucket(gran.production, e.bucket), valeur: e.valeur }));
  const rhEvoData = (series.rh ?? []).map(e => ({ x: fmtBucket(gran.rh, e.bucket), valeur: e.valeur }));
  const setG = (rub, v) => setGran(g => ({ ...g, [rub]: v }));
  const setR = (rub, r) => setCustomRange(c => ({ ...c, [rub]: r }));

  // Filtre BU (côté client) pour les totaux et le détail ; l'évolution est refiltrée côté serveur.
  const selStockBu = bus.find(b => String(b.id) === String(buFilter.stock))?.nom;
  const stockParBuView = buFilter.stock ? d.stock.parBu.filter(b => b.bu_nom === selStockBu) : d.stock.parBu.filter(b => b.valeur > 0);
  const stockValeurView = buFilter.stock ? stockParBuView.reduce((s, b) => s + Number(b.valeur), 0) : d.stock.valeurTotale;
  const stockProduitsView = buFilter.stock ? (d.stock.produits || []).filter(r => r.bu_nom === selStockBu) : (d.stock.produits || []);
  const selProdBu = bus.find(b => String(b.id) === String(buFilter.production))?.nom;
  const prodParBuView = buFilter.production ? d.production.parBu.filter(b => b.bu_nom === selProdBu) : d.production.parBu;
  const prodHierView = buFilter.production ? prodParBuView.reduce((s, b) => s + Number(b.total), 0) : d.production.hier;
  const prodProduitsView = buFilter.production ? (d.production.produits || []).filter(r => r.bu_nom === selProdBu) : (d.production.produits || []);
  const buOptions = <><option value="">{t('cockpit.allBu')}</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}</>;
  const veh = d.logistique;
  const rh = d.rh || { total: 0, actifs: 0, parBu: [] };

  const CARDS = {
    achats: (
      <ModuleCard key="achats" title={t('cockpit.rub.achats')} accent="#7c3aed">
        <StatRow items={[
          { label: t('cockpit.achats.enCours'), value: nf(d.achats.enCours), color: '#7c3aed' },
          { label: t('cockpit.achats.bc'), value: nf(d.achats.bcGeneres), color: '#15803d' },
          { label: t('cockpit.achats.engage'), value: money(d.achats.montantEngage) },
        ]} />
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(d.achats.parStatut).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, c]) => (
            <div key={s} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{s.replace(/_/g, ' ')}</span><strong>{c}</strong>
            </div>
          ))}
        </div>
      </ModuleCard>
    ),
    stock: (
      <ModuleCard key="stock" title={t('cockpit.card.stock')} accent="#2454e0">
        <div style={{ marginBottom: 8 }}>
          <select value={buFilter.stock} onChange={e => setBuFilter(f => ({ ...f, stock: e.target.value }))}>{buOptions}</select>
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(stockValeurView)} <span style={{ fontSize: 14, color: 'var(--color-text-muted)', fontWeight: 600 }}>GNF</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px' }}>
          {pill(t('cockpit.stock.rupture', { n: d.stock.rupture }), true, 'var(--status-red-bg,#fee2e2)', 'var(--status-red-fg,#b91c1c)')}
          {pill(t('cockpit.stock.sousSeuil', { n: d.stock.alerte }), true, 'var(--status-amber-bg,#fef3c7)', 'var(--status-amber-fg,#b45309)')}
          {pill(t('cockpit.stock.relevesToday', { n: d.stock.relevesDuJour.nb }), true, 'var(--color-primary-soft)', 'var(--color-primary)')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '6px 0 2px' }}>
          <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{t('cockpit.stock.evo')}</span>
          <PeriodControl value={gran.stock} onChange={v => setG('stock', v)} range={customRange.stock} onRange={r => setR('stock', r)} />
        </div>
        {stockEvoData.length > 1 ? (
          <div style={{ width: '100%', height: 130 }}>
            <ResponsiveContainer>
              <AreaChart data={stockEvoData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <defs><linearGradient id="stkg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2454e0" stopOpacity={0.45} /><stop offset="100%" stopColor="#2454e0" stopOpacity={0.04} /></linearGradient></defs>
                <XAxis dataKey="x" fontSize={11} />
                <Tooltip formatter={v => nf(v)} />
                <Area type="monotone" dataKey="valeur" stroke="#2454e0" strokeWidth={2} fill="url(#stkg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="empty-row" style={{ margin: '4px 0' }}>{t('cockpit.stock.few')}</p>}
        <div style={{ marginTop: 6 }}>
          {stockParBuView.map((b, i) => (
            <div key={b.bu_nom} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: BU_COLORS[i % BU_COLORS.length], marginRight: 6 }} />{b.bu_nom}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(b.valeur)}</strong>
            </div>
          ))}
        </div>
        {stockProduitsView.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('cockpit.stock.detail')}</div>
            <div style={{ maxHeight: 190, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead><tr style={{ color: 'var(--color-text-muted)' }}>
                  <th style={{ textAlign: 'left', fontWeight: 600, padding: '2px 0' }}>{t('cockpit.th.product')}</th>
                  <th style={{ textAlign: 'right' }}>{t('cockpit.th.releve')}</th><th style={{ textAlign: 'right' }}>{t('cockpit.th.theo')}</th><th style={{ textAlign: 'right' }}>{t('cockpit.th.ecart')}</th>
                </tr></thead>
                <tbody>{stockProduitsView.map(r => (
                  <tr key={r.product_id}>
                    <td style={{ padding: '2px 0' }}>{r.designation || r.code}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{nf(r.releve)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)' }}>{nf(r.theorique)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: r.ecart === 0 ? '#15803d' : r.ecart > 0 ? '#1d4ed8' : '#b91c1c' }}>{r.ecart > 0 ? '+' : ''}{nf(r.ecart)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </ModuleCard>
    ),
    production: (
      <ModuleCard key="production" title={t('cockpit.card.production')} accent="#0f766e">
        <div style={{ marginBottom: 8 }}>
          <select value={buFilter.production} onChange={e => setBuFilter(f => ({ ...f, production: e.target.value }))}>{buOptions}</select>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{nf(prodHierView)}</div>
          {!buFilter.production && <><Delta value={prodDelta} /><span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{t('cockpit.prod.vsDayBefore', { n: nf(d.production.avantHier) })}</span></>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '8px 0 2px' }}>
          <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{t('cockpit.prod.evo')}</span>
          <PeriodControl value={gran.production} onChange={v => setG('production', v)} range={customRange.production} onRange={r => setR('production', r)} />
        </div>
        {prodEvoData.length > 1 ? (
          <div style={{ width: '100%', height: 150 }}>
            <ResponsiveContainer>
              <AreaChart data={prodEvoData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <defs><linearGradient id="prodg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f766e" stopOpacity={0.5} /><stop offset="100%" stopColor="#0f766e" stopOpacity={0.04} /></linearGradient></defs>
                <XAxis dataKey="x" fontSize={11} />
                <Tooltip formatter={v => nf(v)} />
                <Area type="monotone" dataKey="valeur" stroke="#0f766e" strokeWidth={2} fill="url(#prodg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="empty-row" style={{ margin: '10px 0 0' }}>{t('cockpit.prod.few')}</p>}
        <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 6 }}>
          {prodParBuView.length ? prodParBuView.map(b => `${b.bu_nom} : ${nf(b.total)}`).join(' · ') : t('cockpit.prod.none')}
        </div>
        {prodProduitsView.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('cockpit.prod.detail')}</div>
            <div style={{ maxHeight: 170, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <tbody>{prodProduitsView.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '2px 0' }}>{r.designation || r.code}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{nf(r.total)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </ModuleCard>
    ),
    ventes: (
      <ModuleCard key="ventes" title={t('cockpit.card.ventes')} accent="#94a3b8">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '18px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 34 }}>🚧</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>{t('cockpit.ventes.soon')}</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>{t('cockpit.ventes.desc')}</div>
        </div>
      </ModuleCard>
    ),
    logistique: (
      <ModuleCard key="logistique" title={t('cockpit.rub.logistique')} accent="#94a3b8">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '26px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 34 }}>🚧</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>{t('cockpit.logi.soon')}</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>{t('cockpit.logi.desc')}</div>
        </div>
      </ModuleCard>
    ),
    rh: (
      <ModuleCard key="rh" title={t('cockpit.card.rh')} accent="#0891b2">
        <StatRow items={[
          { label: t('cockpit.rh.active'), value: nf(rh.actifs), color: '#0891b2' },
          { label: t('cockpit.rh.total'), value: nf(rh.total) },
          { label: t('cockpit.rh.inactive'), value: nf(rh.inactifs) },
          { label: t('cockpit.rh.left'), value: nf(rh.sortis) },
        ]} />
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(rh.parBu || []).slice(0, 5).map(b => (
            <div key={b.bu_nom} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{b.bu_nom}</span><strong>{b.c}</strong>
            </div>
          ))}
          {(rh.parBu || []).length === 0 && <span className="empty-row" style={{ margin: 0 }}>{t('cockpit.rh.noneActive')}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '12px 0 2px' }}>
          <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{t('cockpit.rh.hires')}</span>
          <PeriodControl value={gran.rh} onChange={v => setG('rh', v)} range={customRange.rh} onRange={r => setR('rh', r)} />
        </div>
        {rhEvoData.length > 1 ? (
          <div style={{ width: '100%', height: 150 }}>
            <ResponsiveContainer>
              <AreaChart data={rhEvoData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <defs><linearGradient id="rhg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0891b2" stopOpacity={0.45} /><stop offset="100%" stopColor="#0891b2" stopOpacity={0.04} /></linearGradient></defs>
                <XAxis dataKey="x" fontSize={11} />
                <Tooltip formatter={v => nf(v)} />
                <Area type="monotone" dataKey="valeur" stroke="#0891b2" strokeWidth={2} fill="url(#rhg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="empty-row" style={{ margin: '4px 0' }}>{t('cockpit.rh.fewHires')}</p>}
      </ModuleCard>
    ),
  };
  const ORDER = ['achats', 'stock', 'production', 'ventes', 'logistique', 'rh'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'linear-gradient(130deg, #2454e0 0%, #16308f 55%, #0c1f5e 100%)', color: '#fff', borderRadius: 20, padding: '26px 28px', boxShadow: '0 12px 30px -12px rgba(20,40,120,0.55)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.85, textTransform: 'capitalize' }}>{longDate(lang)}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>{t('cockpit.heroTitle')}</h1>
            <div style={{ opacity: 0.85, fontSize: 14, marginTop: 4 }}>{t('cockpit.heroSubtitle')}</div>
          </div>
          <button onClick={() => setShowPrefs(s => !s)} style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('cockpit.customize')}</button>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 20 }}>
          {heroPrefs.stock && <HeroStat label={t('cockpit.hero.stockValue')} value={money(d.stock.valeurTotale)} sub={t('cockpit.hero.productsTracked', { n: d.stock.nbProduits })} />}
          {heroPrefs.production && <HeroStat label={t('cockpit.hero.prodYesterday')} value={nf(d.production.hier)} sub={<span>{t('cockpit.vsDayBefore')} <Delta value={prodDelta} /></span>} />}
          {heroPrefs.achats && <HeroStat label={t('cockpit.hero.purchasesOngoing')} value={nf(d.achats.enCours)} sub={t('cockpit.hero.poGenerated', { n: d.achats.bcGeneres })} />}
          {heroPrefs.rh && <HeroStat label={t('cockpit.hero.headcount')} value={nf(rh.actifs)} sub={t('cockpit.hero.ofTotal', { n: rh.total })} />}
          {!Object.values(heroPrefs).some(Boolean) && <div style={{ opacity: 0.75, fontSize: 13 }}>{t('cockpit.noKpi')}</div>}
        </div>
      </div>

      {showPrefs && (
        <section className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('cockpit.bandLabel')}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            {HERO_KPIS.map(k => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!heroPrefs[k]} onChange={() => toggleHero(k)} /> {t(`cockpit.kpi.${k}`)}
              </label>
            ))}
          </div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('cockpit.rubLabel')}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {RUBRIQUES.map(k => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!prefs[k]} onChange={() => toggle(k)} /> {t(`cockpit.rub.${k}`)}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 8 }}>{t('cockpit.prefSaved')}</div>
        </section>
      )}

      {(() => {
        const visibleTabs = ORDER.filter(k => prefs[k]);
        if (!visibleTabs.length) return <p className="empty-row">{t('cockpit.noRub')}</p>;
        const active = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0];
        return (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', background: 'rgba(128,128,128,0.10)', borderRadius: 12, padding: 5 }}>
              {visibleTabs.map(k => {
                const on = k === active;
                return (
                  <button key={k} type="button" onClick={() => setActiveTab(k)}
                    style={{ border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 600, fontSize: 13.5, padding: '8px 16px', borderRadius: 9,
                      background: on ? 'var(--color-primary, #2454e0)' : 'transparent', color: on ? '#fff' : 'var(--color-text-muted, #6b7280)',
                      boxShadow: on ? '0 1px 3px rgba(0,0,0,0.18)' : 'none' }}>{t(`cockpit.rub.${k}`)}</button>
                );
              })}
            </div>
            <div>{CARDS[active]}</div>
          </>
        );
      })()}
    </div>
  );
}
