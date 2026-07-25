import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, isSuperAdmin } from '../../auth/AuthContext';
import { StatusBadge } from './statusLabels.jsx';

export default function ListPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);
  // null = pas encore choisi explicitement par l'utilisateur : on déduit alors un défaut
  // sensé de son rôle (un valideur doit voir les demandes des autres par défaut, pas
  // seulement les siennes — sinon "En attente de mon action" au tableau de bord mène à
  // une liste vide en apparence).
  const [mineOnly, setMineOnly] = useState(null);
  // Peut être activé d'entrée via ?pending=true (lien "Voir les demandes" du tableau de bord).
  const [pendingOnly, setPendingOnly] = useState(searchParams.get('pending') === 'true');

  const nonDemandeurEntities = useMemo(() => {
    if (!user) return [];
    if (isSuperAdmin(user)) return 'all';
    const ids = user.roles.filter(r => r.role_code !== 'demandeur').map(r => r.entity_id);
    return [...new Set(ids)];
  }, [user]);

  const canSeeEntityWide = nonDemandeurEntities === 'all' || nonDemandeurEntities.length > 0;
  const effectiveMineOnly = pendingOnly ? false : (mineOnly === null ? !canSeeEntityWide : mineOnly);

  function toggleMineOnly(checked) {
    setMineOnly(checked);
    if (checked) setPendingOnly(false);
  }

  function togglePendingOnly(checked) {
    setPendingOnly(checked);
    if (checked) setMineOnly(false);
  }

  useEffect(() => {
    setLoading(true);
    let params = {};
    if (pendingOnly) params = { pendingAction: 'true' };
    else if (effectiveMineOnly || !canSeeEntityWide) params = { mine: 'true' };
    client.get('/purchase-requests', { params })
      .then(res => setPrs(res.data))
      .finally(() => setLoading(false));
  }, [effectiveMineOnly, pendingOnly, canSeeEntityWide]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Demandes d'achat</h1>
        <Link to="/purchase-requests/new" className="btn btn-primary">+ Nouvelle demande</Link>
      </div>

      {canSeeEntityWide && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={effectiveMineOnly} onChange={e => toggleMineOnly(e.target.checked)} /> Mes demandes seulement
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={pendingOnly} onChange={e => togglePendingOnly(e.target.checked)} /> Nécessitant mon action
          </label>
        </div>
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
                {prs.length === 0 && (
                  <tr><td className="empty-row" colSpan={6}>
                    {pendingOnly ? 'Aucune demande ne nécessite votre action pour le moment.' : 'Aucune demande.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
