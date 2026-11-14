import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import client from '../../api/client';
import { useAuth, isSuperAdmin } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import { StatusBadge, STATUS_LABELS } from './statusLabels.jsx';
import { useSort, SortTh } from '../../components/useSort.jsx';
import { useAchatFormat } from './useAchatFormat';

// Rapport détaillé des achats (service Achat) : KPIs + historique, filtrable par période (serveur) et
// par Business Unit / entité / statut / recherche (client). S'appuie sur l'endpoint d'export existant.
const REPORT_ROLES = ['service_achat', 'validateur_besoin', 'controle_gestion', 'finances'];
const canSeeReport = (user) => isSuperAdmin(user) || (user?.roles || []).some(r => REPORT_ROLES.includes(r.role_code));

const pad2 = (n) => String(n).padStart(2, '0');
function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  return { from: `${y}-${pad2(m + 1)}-01`, to: `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}` };
}
const dateStr = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
// Montant « articles » d'une ligne : le montant final (devis retenu) sinon le montant du bon de
// commande. Frais = sous-total des frais annexes ; total = articles + frais (coût complet).
const rowMontant = (r) => (r.montant_final != null ? Number(r.montant_final) : (r.montant_bon_commande != null ? Number(r.montant_bon_commande) : null));
const rowFrais = (r) => Number(r.montant_frais ?? r.frais_bon_commande ?? 0) || 0;
const rowTotal = (r) => { const a = rowMontant(r); return a == null ? null : a + rowFrais(r); };

export default function ReportPage() {
  const { user } = useAuth();
  const { sort, by, apply } = useSort();
  const { money } = useAchatFormat();
  const [from, setFrom] = useState(() => currentMonthRange().from);
  const [to, setTo] = useState(() => currentMonthRange().to);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bu, setBu] = useState('');
  const [entite, setEntite] = useState('');
  const [statut, setStatut] = useState('');
  const [q, setQ] = useState('');

  function load() {
    setLoading(true);
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    client.get('/purchase-requests/export', { params })
      .then(res => setRows(res.data || []))
      .finally(() => setLoading(false));
  }
  useEffect(load, []); // chargement initial (mois en cours)

  const buOptions = useMemo(() => [...new Set(rows.map(r => r.business_unit).filter(Boolean))].sort(), [rows]);
  const entiteOptions = useMemo(() => [...new Set(rows.map(r => r.entite).filter(Boolean))].sort(), [rows]);
  const statutOptions = useMemo(() => [...new Set(rows.map(r => r.statut).filter(Boolean))], [rows]);

  const term = q.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter(r =>
    (!bu || r.business_unit === bu) &&
    (!entite || r.entite === entite) &&
    (!statut || r.statut === statut) &&
    (!term || [r.numero, r.objet, r.demandeur, r.fournisseur, r.bon_commande].some(v => String(v || '').toLowerCase().includes(term)))
  ), [rows, bu, entite, statut, term]);

  // KPIs
  const nbDA = filtered.length;
  const nbBC = filtered.filter(r => r.statut === 'bon_commande_genere').length;
  const nbRecu = filtered.filter(r => r.receptionnee).length;
  const parDevise = useMemo(() => {
    const m = {};
    for (const r of filtered) {
      const v = rowMontant(r);
      if (v == null) continue;
      const d = r.devise || 'GNF';
      if (!m[d]) m[d] = { devise: d, montant: 0, frais: 0, total: 0, count: 0 };
      m[d].montant += v; m[d].frais += rowFrais(r); m[d].total += v + rowFrais(r); m[d].count += 1;
    }
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const sorted = apply(filtered);

  if (!canSeeReport(user)) return <Navigate to="/purchase-requests" replace />;

  function exportExcel() {
    const data = sorted.map(r => ({
      'N°': r.numero, 'Date création': dateStr(r.created_at), 'Entité': r.entite, 'Business Unit': r.business_unit || '',
      'Objet': r.objet || '', 'Demandeur': r.demandeur || '', 'Fournisseur retenu': r.fournisseur || '',
      'Statut': STATUS_LABELS[r.statut] || r.statut,
      'Articles': rowMontant(r) != null ? rowMontant(r) : '',
      'Frais': rowMontant(r) != null ? rowFrais(r) : '',
      'Total général': rowTotal(r) != null ? rowTotal(r) : '',
      'Devise': r.devise || '',
      'Bon de commande': r.bon_commande || '', 'Date BC': dateStr(r.date_bon_commande), 'Réceptionnée': r.receptionnee ? 'Oui' : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 30 }, { wch: 22 }, { wch: 24 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rapport achats');
    XLSX.writeFile(wb, `Rapport_achats_${[from, to].filter(Boolean).join('_') || 'tout'}.xlsx`);
  }

  function resetFilters() { setBu(''); setEntite(''); setStatut(''); setQ(''); }
  const hasClientFilter = bu || entite || statut || term;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Rapport des achats</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/purchase-requests" className="btn btn-secondary">← Liste des demandes</Link>
          <button className="btn btn-secondary" disabled={sorted.length === 0} onClick={exportExcel}>Exporter Excel</button>
        </div>
      </div>

      {/* Période (serveur) */}
      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field">Du<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="field">Au<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <button className="btn btn-primary" onClick={load}>Appliquer la période</button>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Filtre sur la date de création de la demande.</span>
      </div>

      {loading ? <Loading /> : (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Kpi label="Demandes" value={nbDA} />
            <Kpi label="Bons de commande" value={nbBC} sub={`${nbRecu} réceptionnée(s)`} />
            {parDevise.length === 0 ? <Kpi label="Montant total" value="—" sub="aucun montant" /> : parDevise.map(d => (
              <Kpi key={d.devise} label={`Total général (${d.devise})`} value={money(d.total)} sub={`Articles ${money(d.montant)} · Frais ${money(d.frais)}`} />
            ))}
          </div>

          {/* Filtres client */}
          <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher (n°, objet, demandeur, fournisseur…)" style={{ minWidth: 240 }} />
            {entiteOptions.length > 1 && (
              <label className="field">Entité
                <select value={entite} onChange={e => setEntite(e.target.value)}><option value="">Toutes</option>{entiteOptions.map(o => <option key={o} value={o}>{o}</option>)}</select>
              </label>
            )}
            {buOptions.length > 0 && (
              <label className="field" style={{ minWidth: 180 }}>Business Unit
                <select value={bu} onChange={e => setBu(e.target.value)}><option value="">Toutes</option>{buOptions.map(o => <option key={o} value={o}>{o}</option>)}</select>
              </label>
            )}
            <label className="field" style={{ minWidth: 180 }}>Statut
              <select value={statut} onChange={e => setStatut(e.target.value)}><option value="">Tous</option>{statutOptions.map(o => <option key={o} value={o}>{STATUS_LABELS[o] || o}</option>)}</select>
            </label>
            {hasClientFilter && <button className="btn btn-secondary btn-sm" onClick={resetFilters}>Réinitialiser</button>}
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{filtered.length} / {rows.length} demande(s)</span>
          </div>

          {/* Historique détaillé */}
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <SortTh label="N°" colKey="numero" get={r => r.numero} sort={sort} by={by} />
                  <SortTh label="Date" colKey="created_at" get={r => new Date(r.created_at).getTime()} sort={sort} by={by} />
                  <SortTh label="Entité" colKey="entite" get={r => r.entite} sort={sort} by={by} />
                  <SortTh label="BU" colKey="bu" get={r => r.business_unit} sort={sort} by={by} />
                  <SortTh label="Objet" colKey="objet" get={r => r.objet} sort={sort} by={by} />
                  <SortTh label="Fournisseur" colKey="fournisseur" get={r => r.fournisseur} sort={sort} by={by} />
                  <SortTh label="Statut" colKey="statut" get={r => r.statut} sort={sort} by={by} />
                  <SortTh label="Articles" colKey="montant" get={r => rowMontant(r) ?? -1} sort={sort} by={by} className="num" />
                  <SortTh label="Frais" colKey="frais" get={r => rowFrais(r)} sort={sort} by={by} className="num" />
                  <SortTh label="Total" colKey="total" get={r => rowTotal(r) ?? -1} sort={sort} by={by} className="num" />
                  <SortTh label="BC" colKey="bc" get={r => r.bon_commande} sort={sort} by={by} />
                </tr></thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.numero + '_' + i}>
                      <td>{r.numero}</td>
                      <td>{dateStr(r.created_at)}</td>
                      <td>{r.entite}</td>
                      <td>{r.business_unit || '—'}</td>
                      <td>{r.objet}</td>
                      <td>{r.fournisseur || '—'}</td>
                      <td><StatusBadge status={r.statut} /></td>
                      <td className="num" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{rowMontant(r) != null ? `${money(rowMontant(r))} ${r.devise || ''}` : '—'}</td>
                      <td className="num" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{rowMontant(r) != null && rowFrais(r) > 0 ? `${money(rowFrais(r))} ${r.devise || ''}` : '—'}</td>
                      <td className="num" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: 700 }}>{rowTotal(r) != null ? `${money(rowTotal(r))} ${r.devise || ''}` : '—'}</td>
                      <td>{r.bon_commande || '—'}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && <tr><td className="empty-row" colSpan={11}>Aucune demande sur la période / les filtres.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="card" style={{ flex: '1 1 170px', minWidth: 170 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
