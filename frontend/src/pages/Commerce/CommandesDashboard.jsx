import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import CommerceSubnav from './CommerceSubnav';

// Tableau de bord des bons de commande commerciaux (Direction commerciale) : volumes, montants,
// remplissage, répartition par type / étape en cours / BU, délai moyen de validation.
const fmt = n => Number(n || 0).toLocaleString('fr-FR');
const STATUT_COLOR = { brouillon: '#6b7280', en_validation: '#b45309', valide: '#128a54', rejetee: '#dc2626', annulee: '#6b7280' };

function Card({ label, value, color }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, padding: '12px 14px', background: 'var(--color-card, #fff)' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--color-text)' }}>{value}</div>
    </div>
  );
}

export default function CommandesDashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [circuit, setCircuit] = useState([]);
  const [f, setF] = useState({ from: '', to: '', type: '', business_unit_id: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    client.get('/business-units/mine').then(r => setBusinessUnits(r.data)).catch(() => {});
    client.get('/commerce/commandes/circuit').then(r => setCircuit(r.data.steps || [])).catch(() => {});
  }, []);
  function load() {
    setLoading(true);
    const params = {};
    for (const k of ['from', 'to', 'type', 'business_unit_id']) if (f[k]) params[k] = f[k];
    client.get('/commerce/commandes/stats', { params }).then(r => setStats(r.data)).catch(() => setStats(null)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [f]);

  const t = stats?.totaux;
  const delai = t?.delai_moyen_jours != null ? Math.round(Number(t.delai_moyen_jours) * 10) / 10 : null;

  return (
    <div>
      <CommerceSubnav />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Tableau de bord — Bons de commande</h2>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => nav('/commerce/commandes')}>← Liste</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <label>Du <input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
          <label>Au <input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></label>
          <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
            <option value="">Tous types</option><option value="yaourt">Yaourt</option><option value="divers">Divers</option>
          </select>
          <select value={f.business_unit_id} onChange={e => setF({ ...f, business_unit_id: e.target.value })}>
            <option value="">Toutes BU</option>
            {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom || b.code}</option>)}
          </select>
          {(f.from || f.to || f.type || f.business_unit_id) && <button className="btn btn-secondary btn-sm" onClick={() => setF({ from: '', to: '', type: '', business_unit_id: '' })}>Réinitialiser</button>}
        </div>

        {loading && <p>Chargement…</p>}
        {t && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <Card label="Total bons" value={fmt(t.total)} />
              <Card label="En validation" value={fmt(t.en_validation)} color={STATUT_COLOR.en_validation} />
              <Card label="Validés" value={fmt(t.valide)} color={STATUT_COLOR.valide} />
              <Card label="Brouillons" value={fmt(t.brouillon)} color={STATUT_COLOR.brouillon} />
              <Card label="Rejetés / Annulés" value={`${fmt(t.rejetee)} / ${fmt(t.annulee)}`} color={STATUT_COLOR.rejetee} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
              <Card label="Montant total (GNF)" value={fmt(t.montant_total)} />
              <Card label="Total casiers" value={fmt(t.casiers)} />
              <Card label="Total cartons" value={fmt(t.cartons)} />
              <Card label="Délai moyen validation" value={delai != null ? `${delai} j` : '—'} />
            </div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px' }}>
                <h3>Par type</h3>
                <table className="table" style={{ width: '100%' }}>
                  <thead><tr><th>Type</th><th>Bons</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
                  <tbody>
                    {(stats.parType || []).map(r => <tr key={r.type}><td>{r.type === 'yaourt' ? 'Yaourt' : 'Divers'}</td><td>{fmt(r.count)}</td><td style={{ textAlign: 'right' }}>{fmt(r.montant)} GNF</td></tr>)}
                    {(stats.parType || []).length === 0 && <tr><td colSpan={3}>—</td></tr>}
                  </tbody>
                </table>
              </div>
              <div style={{ flex: '1 1 280px' }}>
                <h3>En attente par étape</h3>
                <table className="table" style={{ width: '100%' }}>
                  <thead><tr><th>Étape</th><th>Bons</th></tr></thead>
                  <tbody>
                    {(stats.parEtape || []).map(r => <tr key={r.code}><td>{r.nom}</td><td>{fmt(r.count)}</td></tr>)}
                    {(stats.parEtape || []).length === 0 && <tr><td colSpan={2}>Aucun en attente</td></tr>}
                  </tbody>
                </table>
              </div>
              <div style={{ flex: '1 1 280px' }}>
                <h3>Par BU</h3>
                <table className="table" style={{ width: '100%' }}>
                  <thead><tr><th>BU</th><th>Bons</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
                  <tbody>
                    {(stats.parBu || []).map((r, i) => <tr key={i}><td>{r.business_unit_nom || '—'}</td><td>{fmt(r.count)}</td><td style={{ textAlign: 'right' }}>{fmt(r.montant)} GNF</td></tr>)}
                    {(stats.parBu || []).length === 0 && <tr><td colSpan={3}>—</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Circuit de validation & approbateurs */}
        {circuit.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3>Circuit de validation & approbateurs</h3>
            <div className="table-wrap">
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Étape</th><th>Rôle</th><th>Approbateurs habilités</th></tr></thead>
                <tbody>
                  {circuit.filter(s => s.role_code_requis).map(s => (
                    <tr key={s.code}>
                      <td>{s.ordre}. {s.nom}</td>
                      <td>{s.role_code_requis}</td>
                      <td>
                        {s.holders && s.holders.length
                          ? s.holders.join(', ')
                          : <span style={{ color: 'var(--color-danger)' }}>⚠ Aucun approbateur habilité (bloquant)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Les approbateurs se configurent en attribuant les rôles (Admin → Utilisateurs → Rôles par entité).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
