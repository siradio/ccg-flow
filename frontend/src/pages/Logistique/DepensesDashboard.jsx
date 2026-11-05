import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import client from '../../api/client';
import LogistiqueSubnav from './LogistiqueSubnav';
import { StatutBadge } from './DepensesListPage';

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => today().slice(0, 4) + '-01-01';
const money = n => (n == null || n === '' ? '0' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }));
const mLabel = m => (m ? m.split('-').reverse().join('/') : '');

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="card" style={{ flex: '1 1 170px', minWidth: 170 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: tone || 'var(--color-text)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function DepensesDashboard() {
  const navigate = useNavigate();
  const [entities, setEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [types, setTypes] = useState([]);
  const [filters, setFilters] = useState({ from: yearStart(), to: today(), entityId: '', businessUnitId: '', expenseTypeId: '' });
  const [dash, setDash] = useState(null);

  useEffect(() => {
    client.get('/entities').then(r => setEntities(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBusinessUnits(r.data)).catch(() => {});
    client.get('/logistique/depenses/expense-types').then(r => setTypes(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
    client.get(`/logistique/depenses/dashboard?${qs}`).then(r => setDash(r.data)).catch(() => setDash(null));
  }, [filters]);

  const k = dash?.kpi;

  return (
    <div>
      <LogistiqueSubnav />
      <h1 className="page-title" style={{ margin: 0 }}>Dépenses — Tableau de bord</h1>
      <p className="page-subtitle" style={{ margin: '4px 0 12px' }}>Suivi des autorisations de dépense (montants, circuit, répartition).</p>

      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field">Du<input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} /></label>
        <label className="field">Au<input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} /></label>
        <label className="field" style={{ minWidth: 160 }}>Entité
          <select value={filters.entityId} onChange={e => setFilters(f => ({ ...f, entityId: e.target.value }))}>
            <option value="">Toutes</option>{entities.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 150 }}>BU
          <select value={filters.businessUnitId} onChange={e => setFilters(f => ({ ...f, businessUnitId: e.target.value }))}>
            <option value="">Toutes</option>{businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 170 }}>Type
          <select value={filters.expenseTypeId} onChange={e => setFilters(f => ({ ...f, expenseTypeId: e.target.value }))}>
            <option value="">Tous</option>{types.map(t => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </select>
        </label>
      </div>

      {!dash ? <p>Chargement…</p> : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Kpi label="Fiches" value={k.nb_total} sub={`${k.nb_brouillons} brouillon(s)`} />
            <Kpi label="Montant autorisé" value={money(k.montant_autorise) + ' GNF'} sub="fiches approuvées" tone="var(--status-green-fg)" />
            <Kpi label="En attente de validation" value={money(k.montant_en_attente) + ' GNF'} sub={`${k.nb_en_validation} fiche(s)`} tone="var(--status-blue-fg)" />
            <Kpi label="Approuvées" value={k.nb_validees} />
            <Kpi label="Refusées" value={k.nb_rejetees} tone="var(--status-red-fg)" />
          </div>

          <section className="card" style={{ marginBottom: 14 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Évolution mensuelle des montants</h2>
            {dash.evolution.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>Pas de données.</p> : (
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={dash.evolution.map(m => ({ x: mLabel(m.mois), montant: Number(m.montant), nb: m.nb }))} margin={{ top: 6, right: 12, bottom: 6, left: 6 }}>
                    <defs>
                      <linearGradient id="gradDep" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="x" fontSize={11} /><YAxis fontSize={11} width={64} tickFormatter={money} />
                    <Tooltip formatter={v => money(v) + ' GNF'} />
                    <Area type="monotone" dataKey="montant" name="Montant" stroke="#2563eb" strokeWidth={2} fill="url(#gradDep)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <section className="card" style={{ flex: '1 1 340px' }}>
              <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Répartition par type de dépense</h2>
              {dash.parType.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>Pas de données.</p> : (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={dash.parType.map(t => ({ nom: t.libelle, montant: Number(t.montant) }))} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                      <XAxis type="number" fontSize={11} tickFormatter={money} />
                      <YAxis type="category" dataKey="nom" fontSize={11} width={120} />
                      <Tooltip formatter={v => money(v) + ' GNF'} />
                      <Bar dataKey="montant" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
            <section className="card" style={{ flex: '1 1 260px' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Répartition par statut</h3>
              {dash.parStatut.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>—</p> : dash.parStatut.map(s => (
                <div key={s.statut} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
                  <StatutBadge statut={s.statut} /><span><strong>{s.nb}</strong> · {money(s.montant)} GNF</span>
                </div>
              ))}
              <h3 style={{ margin: '14px 0 8px', fontSize: 14 }}>Par Business Unit</h3>
              {dash.parBu.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>—</p> : dash.parBu.map(b => (
                <div key={b.bu} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                  <span>{b.bu}</span><strong>{money(b.montant)} GNF</strong>
                </div>
              ))}
            </section>
          </div>

          <section className="card" style={{ padding: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, padding: '12px 14px' }}>À valider par moi ({dash.aValider.length})</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Numéro</th><th>Entité</th><th>Objet</th><th className="num">Montant</th><th>Étape</th></tr></thead>
                <tbody>
                  {dash.aValider.length === 0 && <tr><td className="empty-row" colSpan={5}>Aucune fiche n'attend votre validation 👍</td></tr>}
                  {dash.aValider.map(a => (
                    <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/logistique/depenses/${a.id}`)}>
                      <td><strong>{a.numero}</strong></td>
                      <td>{a.entity_nom}</td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.objet}</td>
                      <td className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(a.montant_total)} {a.devise}</td>
                      <td style={{ fontSize: 12 }}>{a.step_nom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
