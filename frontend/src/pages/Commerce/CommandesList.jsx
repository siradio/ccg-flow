import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';

const STATUT_LABEL = { brouillon: 'Brouillon', en_validation: 'En validation', valide: 'Validé', rejetee: 'Rejeté', annulee: 'Annulé' };
const STATUT_COLOR = { brouillon: '#6b7280', en_validation: '#b45309', valide: '#128a54', rejetee: '#dc2626', annulee: '#6b7280' };
const fmt = n => Number(n || 0).toLocaleString('fr-FR');

export default function CommandesList() {
  const { user } = useAuth();
  const canAdd = hasSubModuleLevel(user, 'commerce.commandes', 'ajout');
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [mine, setMine] = useState(true);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    client.get('/commerce/commandes', { params: mine ? { mine: 1 } : {} })
      .then(r => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mine]);

  const benef = c => c.beneficiaire_type === 'commercial'
    ? `${c.commercial_code || ''} ${c.commercial_nom || ''}`.trim() || '—'
    : `${c.grossiste_code || ''} ${c.grossiste_nom || ''}`.trim() || '—';

  return (
    <div>
      <CommerceSubnav />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Bons de commande</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {canAdd && <button className="btn btn-primary" onClick={() => nav('/commerce/commandes/new/yaourt')}>+ Yaourt</button>}
            {canAdd && <button className="btn btn-primary" onClick={() => nav('/commerce/commandes/new/divers')}>+ Divers</button>}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ marginRight: 16 }}><input type="radio" checked={mine} onChange={() => setMine(true)} /> Mes commandes</label>
          <label><input type="radio" checked={!mine} onChange={() => setMine(false)} /> Toutes</label>
        </div>
        <div className="table-wrap">
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr><th>N°</th><th>Type</th><th>Bénéficiaire</th><th>Qté</th><th>Montant</th><th>Rempl.</th><th>Statut</th><th>Date</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8}>Chargement…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={8}>Aucune commande.</td></tr>
                  : rows.map(c => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/commerce/commandes/${c.id}`)}>
                      <td>{c.numero || <em style={{ color: 'var(--color-text-muted)' }}>brouillon</em>}</td>
                      <td>{c.type_formulaire === 'yaourt' ? 'Yaourt' : 'Divers'}</td>
                      <td>{benef(c)}</td>
                      <td>{fmt(c.type_formulaire === 'yaourt' ? c.total_casiers : c.total_cartons)} {c.type_formulaire === 'yaourt' ? 'cas.' : 'cart.'}</td>
                      <td>{fmt(c.montant_total)} GNF</td>
                      <td>{c.taux_remplissage != null ? c.taux_remplissage + '%' : '—'}</td>
                      <td><span className="badge" style={{ background: STATUT_COLOR[c.statut] || '#6b7280', color: '#fff' }}>{STATUT_LABEL[c.statut] || c.statut}</span></td>
                      <td style={{ fontSize: 12 }}>{(c.created_at || '').slice(0, 10)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
