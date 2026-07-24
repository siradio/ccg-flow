import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS } from '../PurchaseRequests/statusLabels.jsx';

const ROLE_LABELS = {
  service_achat: 'Service Achat',
  controle_gestion: 'Contrôle de Gestion',
  finances: 'Finances',
  dga: 'DGA',
};

const REFERENTIAL_KPIS = [
  { key: 'employees', label: 'Employés', to: '/referentials/employees' },
  { key: 'products', label: 'Produits', to: '/referentials/products' },
  { key: 'suppliers', label: 'Fournisseurs', to: '/referentials/suppliers' },
  { key: 'sites', label: 'Sites', to: '/referentials/sites' },
  { key: 'warehouses', label: 'Entrepôts', to: '/referentials/warehouses' },
  { key: 'machines', label: 'Machines', to: '/referentials/machines' },
  { key: 'users', label: 'Utilisateurs', to: '/admin/users' },
];

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
  const [data, setData] = useState(null);

  useEffect(() => {
    client.get('/dashboard').then(res => setData(res.data));
  }, []);

  if (!data) return <p>Chargement…</p>;

  const { isAdmin, myRequests, pendingAction, admin } = data;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>Tableau de bord</h1>

      {pendingAction.total > 0 && (
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
            <Link to="/purchase-requests" className="btn btn-primary">Voir les demandes</Link>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Mes demandes d'achat</h2>
        {myRequests.total === 0 ? (
          <p className="empty-row">Vous n'avez encore créé aucune demande. <Link to="/purchase-requests/new">Créer une demande</Link>.</p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -6 }}>{myRequests.total} demande(s) au total</p>
            <StatusBars byStatus={myRequests.byStatus} />
          </>
        )}
      </section>

      {isAdmin && admin && (
        <>
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
