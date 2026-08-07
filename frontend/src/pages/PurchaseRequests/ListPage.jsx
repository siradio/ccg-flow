import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, isSuperAdmin } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import { StatusBadge } from './statusLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

const PAGE_SIZE = 20;

export default function ListPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const [prs, setPrs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
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
    setPage(1);
  }

  function togglePendingOnly(checked) {
    setPendingOnly(checked);
    if (checked) setMineOnly(false);
    setPage(1);
  }

  useEffect(() => {
    setLoading(true);
    let params = { page, pageSize: PAGE_SIZE };
    if (pendingOnly) params = { ...params, pendingAction: 'true' };
    else if (effectiveMineOnly || !canSeeEntityWide) params = { ...params, mine: 'true' };
    client.get('/purchase-requests', { params })
      .then(res => { setPrs(res.data.items); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  }, [effectiveMineOnly, pendingOnly, canSeeEntityWide, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('nav.purchases')}</h1>
        <Link to="/purchase-requests/new" className="btn btn-primary">{t('pr.newBtn')}</Link>
      </div>

      {canSeeEntityWide && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={effectiveMineOnly} onChange={e => toggleMineOnly(e.target.checked)} /> {t('pr.mineOnly')}
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={pendingOnly} onChange={e => togglePendingOnly(e.target.checked)} /> {t('pr.needsAction')}
          </label>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {loading ? <Loading /> : (
            <table>
              <thead>
                <tr>
                  <th>{t('pr.th.number')}</th>
                  <th>{t('pr.th.entity')}</th>
                  <th>{t('pr.th.subject')}</th>
                  <th>{t('pr.th.requester')}</th>
                  <th>{t('pr.th.status')}</th>
                  <th>{t('pr.th.createdAt')}</th>
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
                    <td>{new Date(pr.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}</td>
                  </tr>
                ))}
                {prs.length === 0 && (
                  <tr><td className="empty-row" colSpan={6}>
                    {pendingOnly ? t('pr.emptyPending') : t('pr.empty')}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {!loading && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <span>{t('pr.totalCount', { n: total })}</span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('pr.prev')}</button>
              <span>{t('pr.page', { page, total: totalPages })}</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('pr.next')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
