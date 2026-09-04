import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, isSuperAdmin, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import { StatusBadge } from './statusLabels.jsx';
import { useSort, SortTh } from '../../components/useSort.jsx';
import { useI18n } from '../../i18n/I18nContext';
import SupplierFormModal from '../Referentials/SupplierFormModal.jsx';

// On charge l'ensemble des demandes visibles (volume modéré) puis recherche + tri par colonne
// entièrement côté client — même mécanique que les référentiels.
const PAGE_SIZE = 500;

export default function ListPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { sort, by, apply } = useSort();
  const [searchParams] = useSearchParams();
  const [prs, setPrs] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  // null = pas encore choisi explicitement par l'utilisateur : on déduit alors un défaut
  // sensé de son rôle (un valideur doit voir les demandes des autres par défaut, pas
  // seulement les siennes — sinon "En attente de mon action" au tableau de bord mène à
  // une liste vide en apparence).
  const [mineOnly, setMineOnly] = useState(null);
  // Peut être activé d'entrée via ?pending=true (lien "Voir les demandes" du tableau de bord).
  const [pendingOnly, setPendingOnly] = useState(searchParams.get('pending') === 'true');
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const canAddSupplier = hasSubModuleLevel(user, 'referentiels.suppliers', 'ajout');
  function showToast(m) { setToast(m); setTimeout(() => setToast(c => (c === m ? null : c)), 3200); }

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
    let params = { page: 1, pageSize: PAGE_SIZE };
    if (pendingOnly) params = { ...params, pendingAction: 'true' };
    else if (effectiveMineOnly || !canSeeEntityWide) params = { ...params, mine: 'true' };
    client.get('/purchase-requests', { params })
      .then(res => { setPrs(res.data.items); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  }, [effectiveMineOnly, pendingOnly, canSeeEntityWide]);

  // Recherche libre : numéro, entité, objet, demandeur, ou date (JJ/MM/AAAA).
  const dateStr = (d) => new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR');
  const term = q.trim().toLowerCase();
  const filtered = !term ? prs : prs.filter(pr =>
    [pr.numero, pr.entity_code, pr.objet, `${pr.requester_prenom || ''} ${pr.requester_nom || ''}`, dateStr(pr.created_at)]
      .some(v => String(v || '').toLowerCase().includes(term))
  );
  const rows = apply(filtered);

  return (
    <div>
      {toast && (
        <div className="alert alert-success" style={{ position: 'fixed', top: 16, right: 16, zIndex: 3000, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          {toast}
        </div>
      )}
      <div className="page-header">
        <h1 className="page-title">{t('nav.purchases')}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canAddSupplier && (
            <button type="button" className="btn btn-secondary" onClick={() => setAddSupplierOpen(true)}>{t('refx.addSupplierBtn')}</button>
          )}
          <Link to="/purchase-requests/new" className="btn btn-primary">{t('pr.newBtn')}</Link>
        </div>
      </div>

      {addSupplierOpen && (
        <SupplierFormModal
          onClose={() => setAddSupplierOpen(false)}
          onCreated={() => { setAddSupplierOpen(false); showToast(t('refx.supplierAdded')); }}
        />
      )}

      <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder={t('pr.searchPlaceholder')} style={{ minWidth: 280, flex: '0 1 340px' }} />
        {canSeeEntityWide && (
          <>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={effectiveMineOnly} onChange={e => toggleMineOnly(e.target.checked)} /> {t('pr.mineOnly')}
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={pendingOnly} onChange={e => togglePendingOnly(e.target.checked)} /> {t('pr.needsAction')}
            </label>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {loading ? <Loading /> : (
            <table>
              <thead>
                <tr>
                  <SortTh label={t('pr.th.number')} colKey="numero" get={r => r.numero} sort={sort} by={by} />
                  <SortTh label={t('pr.th.entity')} colKey="entity" get={r => r.entity_code} sort={sort} by={by} />
                  <SortTh label={t('pr.th.subject')} colKey="objet" get={r => r.objet} sort={sort} by={by} />
                  <SortTh label={t('pr.th.requester')} colKey="requester" get={r => `${r.requester_prenom || ''} ${r.requester_nom || ''}`.trim()} sort={sort} by={by} />
                  <SortTh label={t('pr.th.status')} colKey="status" get={r => r.status} sort={sort} by={by} />
                  <SortTh label={t('pr.th.createdAt')} colKey="created_at" get={r => new Date(r.created_at).getTime()} sort={sort} by={by} />
                </tr>
              </thead>
              <tbody>
                {rows.map(pr => (
                  <tr key={pr.id}>
                    <td><Link to={`/purchase-requests/${pr.id}`}>{pr.numero}</Link></td>
                    <td>{pr.entity_code}</td>
                    <td>{pr.objet}</td>
                    <td>{pr.requester_prenom} {pr.requester_nom}</td>
                    <td><StatusBadge status={pr.status} /></td>
                    <td>{dateStr(pr.created_at)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td className="empty-row" colSpan={6}>
                    {term ? t('pr.emptySearch') : pendingOnly ? t('pr.emptyPending') : t('pr.empty')}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {!loading && total > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <span>{term ? `${rows.length} / ${total}` : t('pr.totalCount', { n: total })}</span>
          {total >= PAGE_SIZE && <span> — {t('pr.truncated', { n: PAGE_SIZE })}</span>}
        </div>
      )}
    </div>
  );
}
