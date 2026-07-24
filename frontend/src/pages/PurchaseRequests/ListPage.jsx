import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, isSuperAdmin } from '../../auth/AuthContext';
import { StatusBadge } from './statusLabels.jsx';

export default function ListPage() {
  const { user } = useAuth();
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mineOnly, setMineOnly] = useState(true);

  const nonDemandeurEntities = useMemo(() => {
    if (!user) return [];
    if (isSuperAdmin(user)) return 'all';
    const ids = user.roles.filter(r => r.role_code !== 'demandeur').map(r => r.entity_id);
    return [...new Set(ids)];
  }, [user]);

  const canSeeEntityWide = nonDemandeurEntities === 'all' || nonDemandeurEntities.length > 0;

  useEffect(() => {
    setLoading(true);
    const params = mineOnly || !canSeeEntityWide ? { mine: 'true' } : {};
    client.get('/purchase-requests', { params })
      .then(res => setPrs(res.data))
      .finally(() => setLoading(false));
  }, [mineOnly, canSeeEntityWide]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Demandes d'achat</h1>
        <Link to="/purchase-requests/new" className="btn btn-primary">+ Nouvelle demande</Link>
      </div>

      {canSeeEntityWide && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 13 }}>
          <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} /> Mes demandes seulement
        </label>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {loading ? <p style={{ padding: 20 }}>Chargement…</p> : (
            <table>
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Entité</th>
                  <th>Objet</th>
                  <th>Demandeur</th>
                  <th>Statut</th>
                  <th>Créée le</th>
                </tr>
              </thead>
              <tbody>
                {prs.map(pr => (
                  <tr key={pr.id}>
                    <td><Link to={`/purchase-requests/${pr.id}`}>{pr.numero}</Link></td>
                    <td>{pr.entity_code}</td>
                    <td>{pr.objet}</td>
                    <td>{pr.requester_prenom} {pr.requester_nom}</td>
                    <td><StatusBadge status={pr.status} /></td>
                    <td>{new Date(pr.created_at).toLocaleDateString('fr-FR')}</td>
                  </tr>
                ))}
                {prs.length === 0 && <tr><td className="empty-row" colSpan={6}>Aucune demande.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
