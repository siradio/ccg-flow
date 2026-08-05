import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, Tooltip, Cell } from 'recharts';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';

// Tableau de bord Direction (vue exécutive DG) : stock produits finis du jour, production de la
// veille, ventes (à venir), logistique et achats — agrégés en un appel /api/direction/dashboard.
const BU_COLORS = ['#2454e0', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0891b2'];

function greeting() { const h = new Date().getHours(); return h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir'; }
const nf = n => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
function money(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' Md';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
  return nf(v);
}
const longDate = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function Delta({ value }) {
  if (value === 0 || value == null) return null;
  const up = value > 0;
  return <span style={{ fontSize: 13, fontWeight: 700, color: up ? '#16f0a3' : '#ffb4b4' }}>{up ? '▲' : '▼'} {up ? '+' : ''}{nf(value)}</span>;
}

// Grande tuile chiffrée pour le héros (fond translucide sur le dégradé).
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
  return (
    <section className="card" style={{ borderTop: `3px solid ${accent}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, letterSpacing: '.01em' }}>{title}</h2>
        {to && <Link to={to} style={{ fontSize: 12.5, color: accent, fontWeight: 600, textDecoration: 'none' }}>Ouvrir →</Link>}
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

export default function DirectionDashboard() {
  const { user } = useAuth();
  const canView = hasSubModuleLevel(user, 'direction');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!canView) return;
    client.get('/direction/dashboard').then(r => setD(r.data)).catch(() => setErr(true));
  }, [canView]);

  if (!canView) return <p>Le tableau de bord Direction ne vous a pas été accordé.</p>;
  if (err) return <p className="empty-row">Impossible de charger le tableau de bord.</p>;
  if (!d) return <Loading />;

  const prodDelta = d.production.hier - d.production.avantHier;
  const prodSerie = d.production.serie7j.map(s => ({ x: String(s.jour).slice(8, 10) + '/' + String(s.jour).slice(5, 7), total: s.total }));
  const buData = d.stock.parBu.filter(b => b.valeur > 0).map((b, i) => ({ nom: b.bu_nom, valeur: b.valeur, fill: BU_COLORS[i % BU_COLORS.length] }));
  const veh = d.logistique;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* HÉROS */}
      <div style={{
        background: 'linear-gradient(130deg, #2454e0 0%, #16308f 55%, #0c1f5e 100%)', color: '#fff',
        borderRadius: 20, padding: '26px 28px', boxShadow: '0 12px 30px -12px rgba(20,40,120,0.55)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.85, textTransform: 'capitalize' }}>{longDate()}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-.02em' }}>{greeting()}, Direction 👋</h1>
            <div style={{ opacity: 0.85, fontSize: 14, marginTop: 4 }}>Pilotage du groupe en un coup d'œil.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 20 }}>
          <HeroStat label="Valeur du stock (GNF)" value={money(d.stock.valeurTotale)} sub={`${d.stock.nbProduits} produits suivis`} />
          <HeroStat label="Production de la veille" value={nf(d.production.hier)} sub={<span>vs avant-veille <Delta value={prodDelta} /></span>} />
          <HeroStat label="Achats en cours" value={nf(d.achats.enCours)} sub={`${d.achats.bcGeneres} bons de commande générés`} />
          <HeroStat label="Alertes stock" value={nf(d.stock.rupture + d.stock.alerte)} sub={`${d.stock.rupture} rupture(s) · ${d.stock.alerte} sous seuil`} />
        </div>
      </div>

      {/* GRILLE MODULES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>

        {/* STOCK */}
        <ModuleCard title="📦 Stock produits finis" to="/stock/tableau-bord" accent="#2454e0">
          <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(d.stock.valeurTotale)} <span style={{ fontSize: 14, color: 'var(--color-text-muted)', fontWeight: 600 }}>GNF</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px' }}>
            <span style={{ background: 'var(--status-red-bg, #fee2e2)', color: 'var(--status-red-fg, #b91c1c)', fontWeight: 700, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{d.stock.rupture} rupture</span>
            <span style={{ background: 'var(--status-amber-bg, #fef3c7)', color: 'var(--status-amber-fg, #b45309)', fontWeight: 700, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{d.stock.alerte} sous seuil</span>
            <span style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontWeight: 700, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{d.stock.relevesDuJour.nb} relevés aujourd'hui</span>
          </div>
          {buData.length > 0 && (
            <div style={{ width: '100%', height: 140 }}>
              <ResponsiveContainer>
                <BarChart data={buData} layout="vertical" margin={{ left: 4, right: 8, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <Tooltip formatter={v => money(v) + ' GNF'} cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="valeur" radius={[0, 6, 6, 0]} label={{ position: 'insideLeft', fill: '#fff', fontSize: 11, formatter: (v) => '' }}>
                    {buData.map((b, i) => <Cell key={i} fill={b.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            {d.stock.parBu.filter(b => b.valeur > 0).map((b, i) => (
              <div key={b.bu_nom} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: BU_COLORS[i % BU_COLORS.length], marginRight: 6 }} />{b.bu_nom}</span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(b.valeur)}</strong>
              </div>
            ))}
          </div>
        </ModuleCard>

        {/* PRODUCTION */}
        <ModuleCard title="🏭 Production (veille)" to="/production/releve" accent="#0f766e">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{nf(d.production.hier)}</div>
            <Delta value={prodDelta} />
            <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>vs avant-veille ({nf(d.production.avantHier)})</span>
          </div>
          {prodSerie.length > 1 ? (
            <div style={{ width: '100%', height: 150, marginTop: 8 }}>
              <ResponsiveContainer>
                <AreaChart data={prodSerie} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <defs><linearGradient id="prodg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f766e" stopOpacity={0.5} /><stop offset="100%" stopColor="#0f766e" stopOpacity={0.04} /></linearGradient></defs>
                  <XAxis dataKey="x" fontSize={11} />
                  <Tooltip formatter={v => nf(v)} />
                  <Area type="monotone" dataKey="total" stroke="#0f766e" strokeWidth={2} fill="url(#prodg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="empty-row" style={{ margin: '10px 0 0' }}>Peu de données de production sur 7 jours.</p>}
          <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 6 }}>
            {d.production.parBu.length ? d.production.parBu.map(b => `${b.bu_nom} : ${nf(b.total)}`).join(' · ') : 'Aucune production saisie hier.'}
          </div>
        </ModuleCard>

        {/* VENTES (à venir) */}
        <ModuleCard title="🛒 Ventes (veille)" accent="#94a3b8">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '18px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <div style={{ fontSize: 34 }}>🚧</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>Module Ventes à venir</div>
            <div style={{ fontSize: 12.5, marginTop: 2 }}>Le suivi des ventes de la veille s'affichera ici une fois le module Ventes livré.</div>
          </div>
        </ModuleCard>

        {/* LOGISTIQUE */}
        <ModuleCard title="🚚 Logistique" to="/logistique/vehicules" accent="#b45309">
          <StatRow items={[
            { label: 'Véhicules', value: nf(veh.veh_total) },
            { label: 'Disponibles', value: nf(veh.veh_dispo), color: '#15803d' },
            { label: 'En mission', value: nf(veh.veh_mission), color: '#1d4ed8' },
            { label: 'Maintenance', value: nf(veh.veh_maint), color: '#b45309' },
          ]} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <span style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontWeight: 700, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{veh.missions_actives} mission(s) en cours</span>
            <span style={{ background: veh.pannes_ouvertes ? 'var(--status-amber-bg,#fef3c7)' : 'var(--color-primary-soft)', color: veh.pannes_ouvertes ? 'var(--status-amber-fg,#b45309)' : 'var(--color-text-muted)', fontWeight: 700, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{veh.pannes_ouvertes} panne(s) ouverte(s)</span>
            <span style={{ background: veh.accidents_ouverts ? 'var(--status-red-bg,#fee2e2)' : 'var(--color-primary-soft)', color: veh.accidents_ouverts ? 'var(--status-red-fg,#b91c1c)' : 'var(--color-text-muted)', fontWeight: 700, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{veh.accidents_ouverts} accident(s) en cours</span>
          </div>
        </ModuleCard>

        {/* ACHATS */}
        <ModuleCard title="🧾 Achats" to="/purchase-requests" accent="#7c3aed">
          <StatRow items={[
            { label: 'En cours', value: nf(d.achats.enCours), color: '#7c3aed' },
            { label: 'BC générés', value: nf(d.achats.bcGeneres), color: '#15803d' },
            { label: 'Engagé (GNF)', value: money(d.achats.montantEngage) },
          ]} />
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(d.achats.parStatut).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, c]) => (
              <div key={s} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{s.replace(/_/g, ' ')}</span><strong>{c}</strong>
              </div>
            ))}
          </div>
        </ModuleCard>

      </div>
    </div>
  );
}
