import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasModuleAccess } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS } from '../PurchaseRequests/statusLabels.jsx';

function greetingWord() {
  const h = new Date().getHours();
  if (h >= 5 && h < 18) return 'Bonjour';
  return 'Bonsoir';
}

const ROLE_LABELS = {
  service_achat: 'Service Achat',
  controle_gestion: 'Contrôle de Gestion',
  finances: 'Finances',
  validateur_besoin: 'Validateur expression de besoin',
};

const REFERENTIAL_KPIS = [
  { key: 'employees', label: 'Employés', to: '/employees' },
  { key: 'products', label: 'Produits', to: '/referentials/products' },
  { key: 'suppliers', label: 'Fournisseurs', to: '/referentials/suppliers' },
  { key: 'sites', label: 'Sites', to: '/referentials/sites' },
  { key: 'warehouses', label: 'Entrepôts', to: '/referentials/warehouses' },
  { key: 'machines', label: 'Machines', to: '/referentials/machines' },
  { key: 'users', label: 'Utilisateurs', to: '/admin/users' },
];

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
  const max = Math.max(1, ...Object.values(byStatus));
  const entries = STATUS_ORDER.filter(s => byStatus[s]);
  if (entries.length === 0) return <p className="empty-row">Aucune donnée.</p>;
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

export default function Dashboard() {
  const { user } = useAuth();
  const canSeeAchats = hasModuleAccess(user, 'achats');
  const [data, setData] = useState(null);

  useEffect(() => {
    client.get('/dashboard').then(res => setData(res.data));
  }, []);

  if (!data) return <Loading />;

  const { isAdmin, myRequests, pendingAction, admin } = data;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 4 }}>{greetingWord()} {user?.prenom}</h1>
      <p className="page-subtitle" style={{ marginBottom: 20 }}>Voici un résumé de votre activité.</p>

      {canSeeAchats && pendingAction.total > 0 && (
        <section className="card">
          <div className="highlight-card">
            <div>
              <div className="dashboard-section-title" style={{ margin: 0 }}>En attente de mon action</div>
              <div className="highlight-value">{pendingAction.total}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pendingAction.items.filter(i => i.count > 0).map(i => (
                <span key={`${i.role_code}-${i.entity_id}`} className="badge" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
                  {ROLE_LABELS[i.role_code] || i.role_code} ({i.entity_code}) : {i.count}
                </span>
              ))}
            </div>
            <Link to="/purchase-requests?pending=true" className="btn btn-primary">Voir les demandes</Link>
          </div>
        </section>
      )}

      {canSeeAchats && (
        <section className="card">
          <h2>Mes demandes d'achat</h2>
          {myRequests.total === 0 ? (
            <EmptyState
              title="Vous n'avez encore créé aucune demande."
              action={<Link to="/purchase-requests/new" className="btn btn-primary btn-sm">+ Créer une demande</Link>}
            />
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -6 }}>{myRequests.total} demande(s) au total</p>
              <StatusBars byStatus={myRequests.byStatus} />
            </>
          )}
        </section>
      )}

      {!canSeeAchats && !isAdmin && (
        <section className="card">
          <p className="empty-row" style={{ margin: 0 }}>Aucun module ne vous a encore été accordé, ou seuls des modules sans indicateur de suivi (ex. Stock) le sont pour l'instant.</p>
        </section>
      )}

      {isAdmin && admin && (
        <>
          {admin.activity && (
            <>
              <div className="dashboard-section-title" style={{ marginTop: 0 }}>Activité (7 derniers jours vs 7 précédents)</div>
              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <TrendTile to="/purchase-requests" label="Nouvelles demandes" trend={admin.activity.newRequests} color="var(--color-primary)" />
                <TrendTile to="/purchase-requests" label="Bons de commande générés" trend={admin.activity.ordersGenerated} color="var(--status-green-fg)" />
              </div>
            </>
          )}

          <div className="dashboard-section-title">Référentiels</div>
          <div className="kpi-grid">
            {REFERENTIAL_KPIS.map(k => (
              <Link key={k.key} to={k.to} className="card kpi-card">
                <div className="kpi-value">{admin.counts[k.key]}</div>
                <div className="kpi-label">{k.label}</div>
              </Link>
            ))}
          </div>

          <div className="dashboard-columns">
            <section className="card">
              <h2>Demandes d'achat par statut</h2>
              <StatusBars byStatus={admin.prByStatus} />
            </section>

            <section className="card">
              <h2>Par entité</h2>
              {admin.prByEntity.map(e => {
                const max = Math.max(1, ...admin.prByEntity.map(x => x.count));
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

              {admin.montantParDevise.length > 0 && (
                <>
                  <div className="dashboard-section-title">Montant des bons de commande générés</div>
                  {admin.montantParDevise.map(m => (
                    <p key={m.devise} style={{ margin: '4px 0' }}>
                      <strong>{m.total.toLocaleString('fr-FR')}</strong> {m.devise}
                    </p>
                  ))}
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
