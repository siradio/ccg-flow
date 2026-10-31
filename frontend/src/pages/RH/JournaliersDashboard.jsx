import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import client from '../../api/client';
import RhSubnav from './RhSubnav';
import { exportXlsx } from '../../utils/exportData';

// Dashboard de suivi des demandes de journaliers : volumes par jour / tâche / BU / semaine + liste.
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
const nf = n => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const today = () => new Date().toISOString().slice(0, 10);
const ETAPE = { daf: 'DAF', dg: 'DGA', rh: 'RH' };
const STATUT = { brouillon: 'Brouillon', en_validation: 'En validation', validee: 'Validée', refusee: 'Refusée', annulee: 'Annulée', cloturee: 'Clôturée' };
const STATUT_TONE = { validee: 'var(--status-green-fg)', refusee: 'var(--status-red-fg)', en_validation: 'var(--status-amber-fg)' };

function Kpi({ label, value, sub }) {
  return (
    <div className="card" style={{ flex: '1 1 150px', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{sub}</div>}
    </div>
  );
}

export default function JournaliersDashboard() {
  const nav = useNavigate();
  const [period, setPeriod] = useState({ from: new Date(Date.now() - 56 * 864e5).toISOString().slice(0, 10), to: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), bu: '' });
  const [bus, setBus] = useState([]);
  const [data, setData] = useState(null);

  useEffect(() => { client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    const qs = `date_from=${period.from}&date_to=${period.to}${period.bu ? `&business_unit_id=${period.bu}` : ''}`;
    client.get(`/rh/journaliers/dashboard?${qs}`).then(r => setData(r.data)).catch(() => {});
  }, [period]);

  function exportDemandes() {
    if (!data) return;
    const cols = [
      { key: 'numero', label: 'N°' }, { key: 'bu_nom', label: 'Business Unit' }, { key: 'demandeur', label: 'Demandeur' },
      { key: 'date_debut', label: 'Semaine (lundi)', type: 'date' }, { key: 'total', label: 'Total journaliers', type: 'number' },
      { key: 'statut', label: 'Statut' }, { key: 'role_courant', label: 'Étape' },
    ];
    exportXlsx(`journaliers_${period.from}_${period.to}`, cols, data.demandes.map(d => ({ ...d, statut: STATUT[d.statut] || d.statut, role_courant: ETAPE[d.role_courant] || '' })));
  }

  const parStatut = Object.fromEntries((data?.par_statut || []).map(s => [s.statut, s.n]));

  return (
    <div>
      <RhSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: '4px 0' }}>Journaliers — suivi</h1>
        <button className="btn btn-primary" onClick={() => nav('/rh/demandes/journaliers/new')}>+ Nouvelle demande</button>
      </div>

      <div className="card" style={{ margin: '10px 0 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field">Du<input type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} /></label>
        <label className="field">Au<input type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} /></label>
        <label className="field" style={{ minWidth: 170 }}>Business Unit
          <select value={period.bu} onChange={e => setPeriod(p => ({ ...p, bu: e.target.value }))}>
            <option value="">Toutes</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={exportDemandes} disabled={!data || data.demandes.length === 0}>⬇ Export Excel</button>
      </div>

      {!data ? <p className="empty-row">Chargement…</p> : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Kpi label="Journaliers demandés" value={nf(data.total)} sub={`${data.nb_demandes} demande(s)`} />
            <Kpi label="En validation" value={parStatut.en_validation || 0} sub="DAF / DGA / RH" />
            <Kpi label="Validées" value={parStatut.validee || 0} />
            <Kpi label="À corriger / refusées" value={(parStatut.brouillon || 0)} sub={`${parStatut.refusee || 0} refus`} />
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <section className="card" style={{ flex: '1 1 340px' }}>
              <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Journaliers par jour</h2>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={data.par_jour} margin={{ top: 6, right: 10, bottom: 6, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} width={38} />
                    <Tooltip formatter={v => nf(v)} /><Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card" style={{ flex: '1 1 340px' }}>
              <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Journaliers par tâche</h2>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={data.par_tache} margin={{ top: 6, right: 10, bottom: 6, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="tache" fontSize={11} /><YAxis fontSize={11} width={38} />
                    <Tooltip formatter={v => nf(v)} /><Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {data.par_semaine.length > 1 && (
            <section className="card" style={{ marginBottom: 14 }}>
              <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Évolution par semaine</h2>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={data.par_semaine.map(s => ({ x: d10(s.semaine).slice(0, 5), total: s.total }))} margin={{ top: 6, right: 12, bottom: 6, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="x" fontSize={11} /><YAxis fontSize={11} width={40} />
                    <Tooltip formatter={v => nf(v)} /><Line type="monotone" dataKey="total" stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <section className="card" style={{ padding: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, padding: '12px 14px' }}>Demandes ({data.demandes.length})</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>N°</th><th>Business Unit</th><th>Demandeur</th><th>Semaine</th><th className="num">Total</th><th>Statut</th><th>Étape</th></tr></thead>
                <tbody>
                  {data.demandes.length === 0 && <tr><td className="empty-row" colSpan={7}>Aucune demande.</td></tr>}
                  {data.demandes.map(d => (
                    <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/rh/demandes/${d.id}`)}>
                      <td><strong style={{ color: 'var(--color-primary)' }}>{d.numero}</strong></td>
                      <td>{d.bu_nom}</td><td>{d.demandeur}</td>
                      <td>{d10(d.date_debut)} → {d10(d.date_fin)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{nf(d.total)}</td>
                      <td style={{ color: STATUT_TONE[d.statut] || 'inherit', fontWeight: 600 }}>{STATUT[d.statut] || d.statut}</td>
                      <td>{d.statut === 'en_validation' ? (ETAPE[d.role_courant] || '—') : '—'}</td>
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
