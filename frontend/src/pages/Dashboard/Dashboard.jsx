import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasModuleAccess, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS } from '../PurchaseRequests/statusLabels.jsx';

function greetingKey() {
  const h = new Date().getHours();
  if (h >= 5 && h < 18) return 'dash.greetingMorning';
  return 'dash.greetingEvening';
}

// Codes de rôle → clé de traduction (l'affichage passe par t() ; le code stocké reste inchangé).
const ROLE_LABEL_KEYS = {
  service_achat: 'dash.role.service_achat',
  controle_gestion: 'dash.role.controle_gestion',
  finances: 'dash.role.finances',
  validateur_besoin: 'dash.role.validateur_besoin',
};

const REFERENTIAL_KPIS = [
  { key: 'employees', labelKey: 'refx.nav.employees', to: '/employees' },
  { key: 'products', labelKey: 'refx.nav.products', to: '/referentials/products' },
  { key: 'suppliers', labelKey: 'refx.nav.suppliers', to: '/referentials/suppliers' },
  { key: 'sites', labelKey: 'refx.nav.sites', to: '/referentials/sites' },
  { key: 'warehouses', labelKey: 'refx.nav.warehouses', to: '/referentials/warehouses' },
  { key: 'machines', labelKey: 'refx.nav.machines', to: '/referentials/machines' },
  { key: 'users', labelKey: 'nav.users', to: '/admin/users' },
];

const CONTRAT_COLOR = 'var(--color-primary)';
const STATUT_COLORS_RH = {
  actif: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  inactif: { bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
  sorti: { bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
};

// Onglets du dashboard — "Vue globale" toujours proposée (contenu conditionné en interne à
// kpi.global), les 3 autres n'apparaissent que si leur sous-module KPI est accordé. Ajouter un
// futur domaine (Logistique, Production...) = une entrée ici + son composant *Kpi + sa route
// backend /api/kpi/<domaine> — même schéma que Achats/RH/Stock, aucune autre restructuration.
const DOMAIN_TABS = [
  { key: 'global', labelKey: 'dash.tab.global' },
  { key: 'achats', labelKey: 'dash.tab.achats', subModule: 'kpi.achats' },
  { key: 'rh', labelKey: 'dash.tab.rh', subModule: 'kpi.rh' },
  { key: 'stock', labelKey: 'dash.tab.stock', subModule: 'kpi.stock' },
];

function BarList({ entries, max, colorFor }) {
  const { t } = useI18n();
  const safeMax = Math.max(1, max ?? Math.max(...entries.map(e => e.count), 1));
  if (entries.length === 0) return <p className="empty-row">{t('dash.noData')}</p>;
  return (
    <div>
      {entries.map(e => (
        <div key={e.label} className="bar-row">
          <span className="bar-label">{e.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(e.count / safeMax) * 100}%`, background: colorFor ? colorFor(e.label) : 'var(--color-primary)' }} />
          </div>
          <span className="bar-count">{e.count}</span>
        </div>
      ))}
    </div>
  );
}

function objectToEntries(obj) {
  return Object.entries(obj || {}).map(([label, count]) => ({ label, count }));
}

// Ligne brisée simple sur les 7 derniers jours — pas de bibliothèque de graphiques pour un
// indicateur aussi petit, juste un polyline mis à l'échelle du min/max de la série.
function Sparkline({ values, color }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${26 - ((v - min) / range) * 24}`)
    .join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// trend = { total, delta, sparkline } sur 7 jours vs les 7 précédents (dashboard.service.js) —
// des compteurs d'événements réellement datés (création, génération de BC), jamais de valeur
// inventée pour "faire joli".
function TrendTile({ to, label, trend, color }) {
  const up = trend.delta >= 0;
  return (
    <Link to={to} className="card kpi-tile">
      <div className="kpi-tile-eyebrow">{label}</div>
      <div className="kpi-tile-row">
        <span className="kpi-tile-value">{trend.total}</span>
        {trend.delta !== 0 && (
          <span className={`kpi-tile-delta ${up ? 'up' : 'down'}`}>{up ? '+' : ''}{trend.delta}</span>
        )}
      </div>
      <Sparkline values={trend.sparkline} color={color} />
    </Link>
  );
}

function StatusBars({ byStatus }) {
  const { t } = useI18n();
  const max = Math.max(1, ...Object.values(byStatus));
  const entries = STATUS_ORDER.filter(s => byStatus[s]);
  if (entries.length === 0) return <p className="empty-row">{t('dash.noData')}</p>;
  return (
    <div>
      {entries.map(s => {
        const c = STATUS_COLORS[s] || STATUS_COLORS.brouillon;
        const count = byStatus[s];
        return (
          <div key={s} className="bar-row">
            <span className="bar-dot" style={{ background: c.fg }} />
            <span className="bar-label">{STATUS_LABELS[s] || s}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(count / max) * 100}%`, background: c.fg }} />
            </div>
            <span className="bar-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function GlobalTab({ data }) {
  const { t, lang } = useI18n();
  const loc = lang === 'en' ? 'en-US' : 'fr-FR';
  const { user } = useAuth();
  const canSeeAchats = hasModuleAccess(user, 'achats');
  const { canSeeGlobal, myRequests, pendingAction, global } = data;

  return (
    <>
      {canSeeAchats && pendingAction.total > 0 && (
        <section className="card">
          <div className="highlight-card">
            <div>
              <div className="dashboard-section-title" style={{ margin: 0 }}>{t('dash.pendingMyAction')}</div>
              <div className="highlight-value">{pendingAction.total}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pendingAction.items.filter(i => i.count > 0).map(i => (
                <span key={`${i.role_code}-${i.entity_id}`} className="badge" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
                  {ROLE_LABEL_KEYS[i.role_code] ? t(ROLE_LABEL_KEYS[i.role_code]) : i.role_code} ({i.entity_code}) : {i.count}
                </span>
              ))}
            </div>
            <Link to="/purchase-requests?pending=true" className="btn btn-primary">{t('dash.viewRequests')}</Link>
          </div>
        </section>
      )}

      {canSeeAchats && (
        <section className="card">
          <h2>{t('dash.myPurchaseRequests')}</h2>
          {myRequests.total === 0 ? (
            <EmptyState
              title={t('dash.noRequestYet')}
              action={<Link to="/purchase-requests/new" className="btn btn-primary btn-sm">{t('dash.createRequest')}</Link>}
            />
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -6 }}>{t('pr.totalCount', { n: myRequests.total })}</p>
              <StatusBars byStatus={myRequests.byStatus} />
            </>
          )}
        </section>
      )}

      {!canSeeAchats && !canSeeGlobal && (
        <section className="card">
          <p className="empty-row" style={{ margin: 0 }}>{t('dash.noModule')}</p>
        </section>
      )}

      {canSeeGlobal && global && (
        <>
          {global.activity && (
            <>
              <div className="dashboard-section-title" style={{ marginTop: 0 }}>{t('dash.activity7d')}</div>
              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <TrendTile to="/purchase-requests" label={t('dash.newRequests')} trend={global.activity.newRequests} color="var(--color-primary)" />
                <TrendTile to="/purchase-requests" label={t('dash.ordersGenerated')} trend={global.activity.ordersGenerated} color="var(--status-green-fg)" />
              </div>
            </>
          )}

          <div className="dashboard-section-title">{t('nav.referentials')}</div>
          <div className="kpi-grid">
            {REFERENTIAL_KPIS.map(k => (
              <Link key={k.key} to={k.to} className="card kpi-card">
                <div className="kpi-value">{global.counts[k.key]}</div>
                <div className="kpi-label">{t(k.labelKey)}</div>
              </Link>
            ))}
          </div>

          <div className="dashboard-columns">
            <section className="card">
              <h2>{t('dash.prByStatus')}</h2>
              <StatusBars byStatus={global.prByStatus} />
            </section>

            <section className="card">
              <h2>{t('dash.byEntity')}</h2>
              {global.prByEntity.map(e => {
                const max = Math.max(1, ...global.prByEntity.map(x => x.count));
                return (
                  <div key={e.entity_code} className="bar-row">
                    <span className="bar-label">{e.entity_code}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(e.count / max) * 100}%`, background: 'var(--color-primary)' }} />
                    </div>
                    <span className="bar-count">{e.count}</span>
                  </div>
                );
              })}

              {global.montantParDevise.length > 0 && (
                <>
                  <div className="dashboard-section-title">{t('dash.poAmount')}</div>
                  {global.montantParDevise.map(m => (
                    <p key={m.devise} style={{ margin: '4px 0' }}>
                      <strong>{m.total.toLocaleString(loc)}</strong> {m.devise}
                    </p>
                  ))}
                </>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function AchatsKpiTab({ data }) {
  const { t, lang } = useI18n();
  const loc = lang === 'en' ? 'en-US' : 'fr-FR';
  const statusEntries = STATUS_ORDER
    .filter(s => data.prByStatus[s])
    .map(s => ({ label: STATUS_LABELS[s] || s, count: data.prByStatus[s], code: s }));

  return (
    <>
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-value">{data.tauxRefus.taux != null ? `${Math.round(data.tauxRefus.taux * 100)}%` : '—'}</div>
          <div className="kpi-label">{t('dash.rateRefused')}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-value">{data.delaiMoyenJours != null ? data.delaiMoyenJours.toFixed(1) : '—'}</div>
          <div className="kpi-label">{t('dash.avgDaysToPo')}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-value">{data.tauxRefus.totalSoumises}</div>
          <div className="kpi-label">{t('dash.totalSubmitted')}</div>
        </div>
      </div>

      <div className="dashboard-columns">
        <section className="card">
          <h2>{t('dash.requestsByStatus')}</h2>
          <BarList
            entries={statusEntries}
            colorFor={label => {
              const entry = statusEntries.find(e => e.label === label);
              return (STATUS_COLORS[entry?.code] || STATUS_COLORS.brouillon).fg;
            }}
          />
        </section>

        <section className="card">
          <h2>{t('dash.byEntity')}</h2>
          <BarList entries={data.prByEntity.map(e => ({ label: e.entity_code, count: e.count }))} />

          {data.montantParDevise.length > 0 && (
            <>
              <div className="dashboard-section-title">{t('dash.poAmount')}</div>
              {data.montantParDevise.map(m => (
                <p key={m.devise} style={{ margin: '4px 0' }}>
                  <strong>{m.total.toLocaleString(loc)}</strong> {m.devise}
                </p>
              ))}
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h2>{t('dash.topSuppliers')}</h2>
        {data.topFournisseurs.length === 0 ? <p className="empty-row">{t('dash.noPo')}</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('prd.supplier')}</th><th>{t('prd.amount')}</th><th>{t('prd.currency')}</th></tr></thead>
              <tbody>
                {data.topFournisseurs.map((f, i) => (
                  <tr key={i}>
                    <td>{f.supplier_nom}</td>
                    <td>{f.total.toLocaleString(loc)}</td>
                    <td>{f.devise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t('dash.slaTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '-4px 0 10px' }}>
          {t('dash.slaDesc')}
        </p>
        {(!data.slaParEtape || data.slaParEtape.length === 0) ? (
          <p className="empty-row">{t('dash.slaEmpty')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('dash.th.step')}</th><th>{t('dash.th.slaDays')}</th><th>{t('dash.th.avgDelay')}</th><th>{t('dash.th.slaCompliance')}</th><th>{t('dash.th.validations')}</th></tr></thead>
              <tbody>
                {data.slaParEtape.map(s => {
                  const pct = s.tauxRespectSla != null ? Math.round(s.tauxRespectSla * 100) : null;
                  const color = pct == null ? 'var(--color-text-faint)'
                    : pct >= 80 ? 'var(--status-green-fg)' : pct >= 50 ? 'var(--status-amber-fg)' : 'var(--status-red-fg)';
                  return (
                    <tr key={s.code}>
                      <td>{s.nom}</td>
                      <td>{s.sla_jours != null ? s.sla_jours : '—'}</td>
                      <td>{s.delaiMoyenJours != null ? s.delaiMoyenJours.toFixed(1) : '—'}</td>
                      <td style={{ fontWeight: 700, color }}>{pct != null ? `${pct}%` : '—'}</td>
                      <td>{s.n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function RhKpiTab({ data }) {
  const { t } = useI18n();
  const statutEntries = ['actif', 'inactif', 'sorti']
    .filter(s => data.effectifParStatut[s])
    .map(s => ({ label: t('emp.statut.' + s), count: data.effectifParStatut[s], code: s }));

  return (
    <>
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-value">{data.effectifParStatut.actif || 0}</div>
          <div className="kpi-label">{t('dash.activeEmployees')}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-value">{data.ancienneteMoyenne != null ? data.ancienneteMoyenne.toFixed(1) : '—'}</div>
          <div className="kpi-label">{t('dash.avgTenure')}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-value">{data.effectifParStatut.sorti || 0}</div>
          <div className="kpi-label">{t('cockpit.rh.left')}</div>
        </div>
      </div>

      <div className="dashboard-columns">
        <section className="card">
          <h2>{t('dash.activeByBu')}</h2>
          <BarList entries={data.effectifParBusinessUnit.map(e => ({ label: e.business_unit, count: e.count }))} />
        </section>

        <section className="card">
          <h2>{t('dash.activeByEntity')}</h2>
          <BarList entries={data.effectifParEntite.map(e => ({ label: e.entity_code, count: e.count }))} />
        </section>
      </div>

      <div className="dashboard-columns">
        <section className="card">
          <h2>{t('dash.byStatus')}</h2>
          <BarList
            entries={statutEntries}
            colorFor={label => {
              const entry = statutEntries.find(e => e.label === label);
              return (STATUT_COLORS_RH[entry?.code] || STATUT_COLORS_RH.actif).fg;
            }}
          />
        </section>

        <section className="card">
          <h2>{t('dash.activeByContract')}</h2>
          <BarList entries={objectToEntries(data.effectifParContrat)} colorFor={() => CONTRAT_COLOR} />
        </section>
      </div>
    </>
  );
}

function StockKpiTab({ data }) {
  const { t, lang } = useI18n();
  const loc = lang === 'en' ? 'en-US' : 'fr-FR';
  return (
    <>
      <p style={{ marginBottom: 16 }}>
        <Link to="/stock/tableau-bord">{t('dash.stockDetailLink')}</Link>
      </p>
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-value">{Math.round(data.stockGlobal).toLocaleString(loc)}</div>
          <div className="kpi-label">{t('dash.stockGlobal')}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-value">{data.produitsSuivis}</div>
          <div className="kpi-label">{t('dash.productsTracked')}</div>
        </div>
        <div className="card kpi-card" style={{ background: data.rupture.length > 0 ? 'var(--color-danger-soft)' : undefined }}>
          <div className="kpi-value">{data.rupture.length}</div>
          <div className="kpi-label">{t('dash.productsRupture')}</div>
        </div>
        <div className="card kpi-card" style={{ background: data.seuilBas.length > 0 ? 'var(--color-warning-bg)' : undefined }}>
          <div className="kpi-value">{data.seuilBas.length}</div>
          <div className="kpi-label">{t('dash.productsBelowThreshold')}</div>
        </div>
      </div>

      <div className="dashboard-columns">
        <section className="card">
          <h2>{t('dash.stockByBu')}</h2>
          <BarList entries={data.stockParBu.map(e => ({ label: e.business_unit, count: Math.round(e.total) }))} />
        </section>

        <section className="card">
          <h2>{t('dash.ruptureProducts')}</h2>
          {data.rupture.length === 0 ? <p className="empty-row">{t('dash.noRupture')}</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('dash.th.product')}</th><th>{t('dash.th.bu')}</th><th>{t('dash.th.date')}</th></tr></thead>
                <tbody>
                  {data.rupture.map(r => (
                    <tr key={r.product_id}>
                      <td>{r.designation}{r.code ? ` (${r.code})` : ''}</td>
                      <td>{r.business_unit}</td>
                      <td>{new Date(r.date_stock).toLocaleDateString(loc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <h2>{t('dash.productsBelowThreshold')}</h2>
        {data.seuilBas.length === 0 ? <p className="empty-row">{t('dash.noBelowThreshold')}</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('dash.th.product')}</th><th>{t('dash.th.bu')}</th><th>{t('dash.th.quantity')}</th><th>{t('dash.th.threshold')}</th><th>{t('dash.th.date')}</th></tr></thead>
              <tbody>
                {data.seuilBas.map(r => (
                  <tr key={r.product_id}>
                    <td>{r.designation}{r.code ? ` (${r.code})` : ''}</td>
                    <td>{r.business_unit}</td>
                    <td>{Number(r.quantite).toLocaleString(loc)}</td>
                    <td>{Number(r.seuil_alerte_stock).toLocaleString(loc)}</td>
                    <td>{new Date(r.date_stock).toLocaleDateString(loc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function Dashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const allowedTabs = DOMAIN_TABS.filter(tb => tb.key === 'global' || hasSubModuleLevel(user, tb.subModule));

  const [tab, setTab] = useState('global');
  const [data, setData] = useState(null);
  const [achats, setAchats] = useState(null);
  const [rh, setRh] = useState(null);
  const [stock, setStock] = useState(null);

  useEffect(() => {
    client.get('/dashboard').then(res => setData(res.data));
    if (allowedTabs.some(tb => tb.key === 'achats')) client.get('/kpi/achats').then(res => setAchats(res.data));
    if (allowedTabs.some(tb => tb.key === 'rh')) client.get('/kpi/rh').then(res => setRh(res.data));
    if (allowedTabs.some(tb => tb.key === 'stock')) client.get('/kpi/stock').then(res => setStock(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <Loading />;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 4 }}>{t(greetingKey())} {user?.prenom}</h1>
      <p className="page-subtitle" style={{ marginBottom: 20 }}>{t('dash.subtitle')}</p>

      <nav className="subnav">
        {allowedTabs.map(tb => (
          <a key={tb.key} className={tab === tb.key ? 'active' : undefined} onClick={() => setTab(tb.key)} style={{ cursor: 'pointer' }}>{t(tb.labelKey)}</a>
        ))}
      </nav>

      {tab === 'global' && <GlobalTab data={data} />}
      {tab === 'achats' && (achats ? <AchatsKpiTab data={achats} /> : <p>{t('prd.loading')}</p>)}
      {tab === 'rh' && (rh ? <RhKpiTab data={rh} /> : <p>{t('prd.loading')}</p>)}
      {tab === 'stock' && (stock ? <StockKpiTab data={stock} /> : <p>{t('prd.loading')}</p>)}
    </div>
  );
}
