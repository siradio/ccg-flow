import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';
import DepenseFormModal from './DepenseFormModal';

// Module Logistique → Autorisation de dépense : liste des fiches + saisie (modale). Interface en
// français (langue d'exploitation). Le circuit de validation se pilote depuis la fiche (détail).
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';
const money = n => (n == null || n === '' ? '0' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');

export const STATUTS = {
  brouillon: { label: 'Brouillon', bg: 'var(--status-neutral-bg)', fg: 'var(--color-text-muted)' },
  en_validation: { label: 'En validation', bg: 'var(--status-blue-bg)', fg: 'var(--status-blue-fg)' },
  validee: { label: 'Approuvée', bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  rejetee: { label: 'Refusée', bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
};

export function StatutBadge({ statut }) {
  const s = STATUTS[statut] || STATUTS.brouillon;
  return <span className="badge" style={{ background: s.bg, color: s.fg, fontWeight: 700 }}>{s.label}</span>;
}

export default function DepensesListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = hasSubModuleLevel(user, 'logistique.depenses', 'edition');

  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), statut: '', q: '' });
  const [formOpen, setFormOpen] = useState(false);

  function load() {
    const qs = new URLSearchParams();
    if (filters.from) qs.set('from', filters.from);
    if (filters.to) qs.set('to', filters.to);
    if (filters.statut) qs.set('statut', filters.statut);
    if (filters.q) qs.set('q', filters.q);
    client.get(`/logistique/depenses?${qs}`).then(r => setRows(r.data)).catch(() => setRows([]));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters]);

  return (
    <div>
      <LogistiqueSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Autorisations de dépense</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>Saisie, circuit de validation et suivi des dépenses.</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setFormOpen(true)}>+ Nouvelle autorisation</button>}
      </div>

      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field">Du<input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} /></label>
        <label className="field">Au<input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} /></label>
        <label className="field" style={{ minWidth: 160 }}>Statut
          <select value={filters.statut} onChange={e => setFilters(f => ({ ...f, statut: e.target.value }))}>
            <option value="">Tous</option>
            {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: 1, minWidth: 180 }}>Recherche
          <input placeholder="Objet ou numéro…" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
        </label>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Numéro</th><th>Date</th><th>Entité</th><th>Objet</th><th>Type</th>
              <th className="num">Montant</th><th className="num">Reste à payer</th><th>Statut</th><th>Étape</th>
            </tr></thead>
            <tbody>
              {rows === null && <tr><td className="empty-row" colSpan={9}>Chargement…</td></tr>}
              {rows && rows.length === 0 && <tr><td className="empty-row" colSpan={9}>Aucune autorisation sur la période.</td></tr>}
              {rows && rows.map(a => (
                <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/logistique/depenses/${a.id}`)}>
                  <td><strong>{a.numero || '—'}</strong></td>
                  <td>{d10(a.created_at)}</td>
                  <td>{a.entity_nom}{a.bu_nom ? ` — ${a.bu_nom}` : ''}</td>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.objet}</td>
                  <td>{a.expense_type_libelle || '—'}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(a.montant_total)} {a.devise}</td>
                  <td className="num" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{money(a.reste_a_payer)} {a.devise}</td>
                  <td><StatutBadge statut={a.statut} /></td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{a.statut === 'en_validation' ? (a.current_step_nom || '—') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <DepenseFormModal
          user={user}
          onClose={() => setFormOpen(false)}
          onSaved={(a) => { setFormOpen(false); navigate(`/logistique/depenses/${a.id}`); }}
        />
      )}
    </div>
  );
}
