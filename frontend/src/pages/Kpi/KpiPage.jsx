import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS } from '../PurchaseRequests/statusLabels.jsx';

const CONTRAT_COLOR = 'var(--color-primary)';
const STATUT_LABELS_RH = { actif: 'Actif', inactif: 'Inactif', sorti: 'Sorti' };
const STATUT_COLORS_RH = {
  actif: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  inactif: { bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
  sorti: { bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
};

function BarList({ entries, max, colorFor }) {
  const safeMax = Math.max(1, max ?? Math.max(...entries.map(e => e.count), 1));
  if (entries.length === 0) return <p className="empty-row">Aucune donnée.</p>;
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

function AchatsKpi({ data }) {
  const statusEntries = STATUS_ORDER
    .filter(s => data.prByStatus[s])
    .map(s => ({ label: STATUS_LABELS[s] || s, count: data.prByStatus[s], code: s }));

  return (
    <>
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-value">{data.tauxRefus.taux != null ? `${Math.round(data.tauxRefus.taux * 100)}%` : '—'}</div>
          <div className="kpi-label">Taux de demandes refusées au moins une fois</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-value">{data.delaiMoyenJours != null ? data.delaiMoyenJours.toFixed(1) : '—'}</div>
          <div className="kpi-label">Jours moyens jusqu'au bon de commande</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-value">{data.tauxRefus.totalSoumises}</div>
          <div className="kpi-label">Demandes soumises au total</div>
        </div>
      </div>

      <div className="dashboard-columns">
        <section className="card">
          <h2>Demandes par statut</h2>
          <BarList
            entries={statusEntries}
            colorFor={label => {
              const entry = statusEntries.find(e => e.label === label);
              return (STATUS_COLORS[entry?.code] || STATUS_COLORS.brouillon).fg;
            }}
          />
        </section>

        <section className="card">
          <h2>Par entité</h2>
          <BarList entries={data.prByEntity.map(e => ({ label: e.entity_code, count: e.count }))} />

          {data.montantParDevise.length > 0 && (
            <>
              <div className="dashboard-section-title">Montant des bons de commande générés</div>
              {data.montantParDevise.map(m => (
                <p key={m.devise} style={{ margin: '4px 0' }}>
                  <strong>{m.total.toLocaleString('fr-FR')}</strong> {m.devise}
                </p>
              ))}
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Top fournisseurs (par montant de bons de commande)</h2>
        {data.topFournisseurs.length === 0 ? <p className="empty-row">Aucun bon de commande généré.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fournisseur</th><th>Montant</th><th>Devise</th></tr></thead>
              <tbody>
                {data.topFournisseurs.map((f, i) => (
                  <tr key={i}>
                    <td>{f.supplier_nom}</td>
                    <td>{f.total.toLocaleString('fr-FR')}</td>
                    <td>{f.devise}</td>
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

function RhKpi({ data }) {
  const statutEntries = ['actif', 'inactif', 'sorti']
    .filter(s => data.effectifParStatut[s])
    .map(s => ({ label: STATUT_LABELS_RH[s], count: data.effectifParStatut[s], code: s }));

  return (
    <>
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-value">{data.effectifParStatut.actif || 0}</div>
          <div className="kpi-label">Employés actifs</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-value">{data.ancienneteMoyenne != null ? data.ancienneteMoyenne.toFixed(1) : '—'}</div>
          <div className="kpi-label">Ancienneté moyenne (années)</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-value">{data.effectifParStatut.sorti || 0}</div>
          <div className="kpi-label">Sortis</div>
        </div>
      </div>

      <div className="dashboard-columns">
        <section className="card">
          <h2>Effectif actif par Business Unit</h2>
          <BarList entries={data.effectifParBusinessUnit.map(e => ({ label: e.business_unit, count: e.count }))} />
        </section>

        <section className="card">
          <h2>Effectif actif par entité</h2>
          <BarList entries={data.effectifParEntite.map(e => ({ label: e.entity_code, count: e.count }))} />
        </section>
      </div>

      <div className="dashboard-columns">
        <section className="card">
          <h2>Par statut</h2>
          <BarList
            entries={statutEntries}
            colorFor={label => {
              const entry = statutEntries.find(e => e.label === label);
              return (STATUT_COLORS_RH[entry?.code] || STATUT_COLORS_RH.actif).fg;
            }}
          />
        </section>

        <section className="card">
          <h2>Effectif actif par type de contrat</h2>
          <BarList entries={objectToEntries(data.effectifParContrat)} colorFor={() => CONTRAT_COLOR} />
        </section>
      </div>
    </>
  );
}

function StockKpi({ data }) {
  return (
    <>
      <p style={{ marginBottom: 16 }}>
        <Link to="/stock/dashboard-dg">Voir l'analyse détaillée (par Business Unit, évolution, top mouvements) →</Link>
      </p>
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-value">{Math.round(data.stockGlobal).toLocaleString('fr-FR')}</div>
          <div className="kpi-label">Stock global (dernière saisie par produit, toutes BU)</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-value">{data.produitsSuivis}</div>
          <div className="kpi-label">Produits suivis (au moins une saisie)</div>
        </div>
        <div className="card kpi-card" style={{ background: data.rupture.length > 0 ? 'var(--color-danger-soft)' : undefined }}>
          <div className="kpi-value">{data.rupture.length}</div>
          <div className="kpi-label">Produits en rupture (stock = 0)</div>
        </div>
        <div className="card kpi-card" style={{ background: data.seuilBas.length > 0 ? 'var(--color-warning-bg)' : undefined }}>
          <div className="kpi-value">{data.seuilBas.length}</div>
          <div className="kpi-label">Produits sous le seuil d'alerte</div>
        </div>
      </div>

      <div className="dashboard-columns">
        <section className="card">
          <h2>Stock par Business Unit</h2>
          <BarList entries={data.stockParBu.map(e => ({ label: e.business_unit, count: Math.round(e.total) }))} />
        </section>

        <section className="card">
          <h2>Produits en rupture</h2>
          {data.rupture.length === 0 ? <p className="empty-row">Aucun produit en rupture.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Produit</th><th>BU</th><th>Date</th></tr></thead>
                <tbody>
                  {data.rupture.map(r => (
                    <tr key={r.product_id}>
                      <td>{r.designation}{r.code ? ` (${r.code})` : ''}</td>
                      <td>{r.business_unit}</td>
                      <td>{new Date(r.date_stock).toLocaleDateString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Produits sous le seuil d'alerte</h2>
        {data.seuilBas.length === 0 ? <p className="empty-row">Aucun produit sous son seuil.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Produit</th><th>BU</th><th>Quantité</th><th>Seuil</th><th>Date</th></tr></thead>
              <tbody>
                {data.seuilBas.map(r => (
                  <tr key={r.product_id}>
                    <td>{r.designation}{r.code ? ` (${r.code})` : ''}</td>
                    <td>{r.business_unit}</td>
                    <td>{Number(r.quantite).toLocaleString('fr-FR')}</td>
                    <td>{Number(r.seuil_alerte_stock).toLocaleString('fr-FR')}</td>
                    <td>{new Date(r.date_stock).toLocaleDateString('fr-FR')}</td>
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

const TABS = [
  { key: 'achats', label: 'Achats', subModule: 'kpi.achats' },
  { key: 'rh', label: 'RH', subModule: 'kpi.rh' },
  { key: 'stock', label: 'Stock (résumé)', subModule: 'kpi.stock' },
];

export default function KpiPage() {
  const { user } = useAuth();
  const allowedTabs = TABS.filter(t => hasSubModuleLevel(user, t.subModule));

  const [tab, setTab] = useState(allowedTabs[0]?.key);
  const [achats, setAchats] = useState(null);
  const [rh, setRh] = useState(null);
  const [stock, setStock] = useState(null);

  useEffect(() => {
    if (allowedTabs.some(t => t.key === 'achats')) client.get('/kpi/achats').then(res => setAchats(res.data));
    if (allowedTabs.some(t => t.key === 'rh')) client.get('/kpi/rh').then(res => setRh(res.data));
    if (allowedTabs.some(t => t.key === 'stock')) client.get('/kpi/stock').then(res => setStock(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>KPI</h1>

      <nav className="subnav">
        {allowedTabs.map(t => (
          <a key={t.key} className={tab === t.key ? 'active' : undefined} onClick={() => setTab(t.key)} style={{ cursor: 'pointer' }}>{t.label}</a>
        ))}
      </nav>

      {tab === 'achats' && (achats ? <AchatsKpi data={achats} /> : <p>Chargement…</p>)}
      {tab === 'rh' && (rh ? <RhKpi data={rh} /> : <p>Chargement…</p>)}
      {tab === 'stock' && (stock ? <StockKpi data={stock} /> : <p>Chargement…</p>)}
    </div>
  );
}
