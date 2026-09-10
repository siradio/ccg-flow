import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import * as XLSX from 'xlsx';
import { useAuth, isSuperAdmin, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import { StatusBadge, STATUS_LABELS } from './statusLabels.jsx';
import { useSort, SortTh } from '../../components/useSort.jsx';
import { useI18n } from '../../i18n/I18nContext';
import SupplierFormModal from '../Referentials/SupplierFormModal.jsx';
import Pagination from '../../components/Pagination.jsx';

// Rôles de la chaîne de validation du workflow achats : seuls eux (ou super_admin) peuvent exporter.
const EXPORT_ROLES = ['service_achat', 'validateur_besoin', 'controle_gestion', 'finances'];
const canExportAchats = (user) => isSuperAdmin(user) || (user?.roles || []).some(r => EXPORT_ROLES.includes(r.role_code));

const UI_PAGE_SIZE = 20;
const pad2 = (n) => String(n).padStart(2, '0');
// Bornes du mois en cours (valeurs par défaut du filtre d'export).
function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  return {
    from: `${y}-${pad2(m + 1)}-01`,
    to: `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}`,
  };
}

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

  // Export Excel (analyse hors application) — réservé aux valideurs.
  const canExport = canExportAchats(user);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState(() => currentMonthRange().from);
  const [exportTo, setExportTo] = useState(() => currentMonthRange().to);
  const [exporting, setExporting] = useState(false);
  async function exportExcel() {
    setExporting(true);
    try {
      const params = {};
      if (exportFrom) params.from = exportFrom;
      if (exportTo) params.to = exportTo;
      const { data } = await client.get('/purchase-requests/export', { params });
      const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
      const rows = data.map(r => ({
        'N°': r.numero,
        'Entité': r.entite,
        'Business Unit': r.business_unit || '',
        'Objet': r.objet || '',
        'Demandeur': r.demandeur || '',
        'Statut': STATUS_LABELS[r.statut] || r.statut,
        'Montant': r.montant_final != null ? Number(r.montant_final) : (r.montant_bon_commande != null ? Number(r.montant_bon_commande) : ''),
        'Devise': r.devise || '',
        'Fournisseur retenu': r.fournisseur || '',
        'Bon de commande': r.bon_commande || '',
        'Date BC': fmtDate(r.date_bon_commande),
        'Justification': r.justification || '',
        'Date création': fmtDate(r.created_at),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 30 }, { wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 8 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 30 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Achats');
      const suffix = [exportFrom, exportTo].filter(Boolean).join('_') || 'tout';
      XLSX.writeFile(wb, `Achats_${suffix}.xlsx`);
      showToast(t('pr.export.done', { n: rows.length }));
      setExportOpen(false);
    } catch (err) {
      showToast(err.response?.data?.error || t('pr.export.error'));
    } finally {
      setExporting(false);
    }
  }

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
  // Pagination client : 20 par page ; retour page 1 quand la recherche/les filtres changent le total.
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, effectiveMineOnly, pendingOnly]);
  const pageRows = rows.slice((page - 1) * UI_PAGE_SIZE, page * UI_PAGE_SIZE);

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
          {canExport && (
            <button type="button" className="btn btn-secondary" onClick={() => setExportOpen(o => !o)}>{t('pr.export.btn')}</button>
          )}
          {canAddSupplier && (
            <button type="button" className="btn btn-secondary" onClick={() => setAddSupplierOpen(true)}>{t('refx.addSupplierBtn')}</button>
          )}
          <Link to="/purchase-requests/new" className="btn btn-primary">{t('pr.newBtn')}</Link>
        </div>
      </div>

      {canExport && exportOpen && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field">{t('pr.export.from')}
            <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} />
          </label>
          <label className="field">{t('pr.export.to')}
            <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" disabled={exporting} onClick={exportExcel}>
            {exporting ? t('pr.export.running') : t('pr.export.download')}
          </button>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('pr.export.hint')}</span>
        </div>
      )}

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
                  <SortTh label={t('pr.th.reception')} colKey="reception" get={r => r.status === 'bon_commande_genere' ? (r.receptionnee ? 2 : 1) : 0} sort={sort} by={by} />
                  <SortTh label={t('pr.th.createdAt')} colKey="created_at" get={r => new Date(r.created_at).getTime()} sort={sort} by={by} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(pr => (
                  <tr key={pr.id}>
                    <td><Link to={`/purchase-requests/${pr.id}`}>{pr.numero}</Link></td>
                    <td>{pr.entity_code}</td>
                    <td>{pr.objet}</td>
                    <td>{pr.requester_prenom} {pr.requester_nom}</td>
                    <td><StatusBadge status={pr.status} /></td>
                    <td>
                      {pr.status === 'bon_commande_genere' ? (
                        <span className="badge" style={pr.receptionnee
                          ? { background: 'var(--status-green-bg)', color: 'var(--status-green-fg)' }
                          : { background: 'var(--status-amber-bg, #fef3c7)', color: 'var(--status-amber-fg, #b45309)' }}>
                          {pr.receptionnee ? t('pr.reception.received') : t('pr.reception.pending')}
                        </span>
                      ) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                    </td>
                    <td>{dateStr(pr.created_at)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td className="empty-row" colSpan={7}>
                    {term ? t('pr.emptySearch') : pendingOnly ? t('pr.emptyPending') : t('pr.empty')}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {!loading && <Pagination page={page} total={rows.length} pageSize={UI_PAGE_SIZE} onPage={setPage} />}

      {!loading && total > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <span>{term ? `${rows.length} / ${total}` : t('pr.totalCount', { n: total })}</span>
          {total >= PAGE_SIZE && <span> — {t('pr.truncated', { n: PAGE_SIZE })}</span>}
        </div>
      )}
    </div>
  );
}
