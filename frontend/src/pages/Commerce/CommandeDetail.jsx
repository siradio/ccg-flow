import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';

const STATUT_LABEL = { brouillon: 'Brouillon', en_validation: 'En validation', valide: 'Validé', rejetee: 'Rejeté', annulee: 'Annulé' };
const STATUT_COLOR = { brouillon: '#6b7280', en_validation: '#b45309', valide: '#128a54', rejetee: '#dc2626', annulee: '#6b7280' };
const fmt = n => Number(n || 0).toLocaleString('fr-FR');

export default function CommandeDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const canEdit = hasSubModuleLevel(user, 'commerce.commandes', 'edition');
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() { client.get(`/commerce/commandes/${id}`).then(r => setC(r.data)).catch(() => setError('Commande introuvable.')); }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function submit() {
    setBusy(true); setError('');
    try { await client.post(`/commerce/commandes/${id}/submit`, {}); load(); }
    catch (e) {
      const d = e?.response?.data;
      if (d?.code === 'motif_requis') {
        const m = window.prompt(`Remplissage ${d.taux}% < seuil ${d.seuil}%.\nMotif de sous-charge (obligatoire) :`);
        if (m && m.trim()) { try { await client.post(`/commerce/commandes/${id}/submit`, { motif_sous_charge: m.trim() }); load(); } catch (e2) { setError(e2?.response?.data?.error || 'Erreur.'); } }
        else setError('Soumission annulée : motif requis.');
      } else setError(d?.error || 'Erreur à la soumission.');
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Supprimer définitivement ce brouillon ?')) return;
    try { await client.delete(`/commerce/commandes/${id}`); nav('/commerce/commandes'); }
    catch (e) { setError(e?.response?.data?.error || 'Erreur.'); }
  }

  if (error && !c) return <div><CommerceSubnav /><p style={{ padding: 16, color: 'var(--color-danger)' }}>{error}</p></div>;
  if (!c) return <div><CommerceSubnav /><p style={{ padding: 16 }}>Chargement…</p></div>;

  const unite = c.type_formulaire === 'yaourt' ? 'casier' : 'carton';
  const benef = c.beneficiaire_type === 'commercial'
    ? `${c.commercial_code || ''} ${c.commercial_nom || ''}`.trim()
    : `${c.grossiste_code || ''} ${c.grossiste_nom || ''}`.trim();
  const totalQ = c.type_formulaire === 'yaourt' ? c.total_casiers : c.total_cartons;
  const Info = ({ l, v }) => (<div style={{ minWidth: 180 }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{l}</div><div>{v || '—'}</div></div>);

  return (
    <div>
      <CommerceSubnav />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{c.numero || 'Brouillon'} — {c.type_formulaire === 'yaourt' ? 'Yaourt' : 'Divers'}</h2>
          <span className="badge" style={{ background: STATUT_COLOR[c.statut] || '#6b7280', color: '#fff' }}>{STATUT_LABEL[c.statut] || c.statut}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {c.statut === 'brouillon' && canEdit && <button className="btn" onClick={() => nav(`/commerce/commandes/${id}/edit`)}>Modifier</button>}
            {c.statut === 'brouillon' && canEdit && <button className="btn btn-primary" onClick={submit} disabled={busy}>Soumettre</button>}
            {c.statut === 'brouillon' && canEdit && <button className="btn btn-danger-ghost" onClick={remove} disabled={busy}>Supprimer</button>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16, padding: 14, background: 'var(--color-card, #fff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8 }}>
          <Info l="Bénéficiaire" v={`${benef} (${c.beneficiaire_type === 'commercial' ? 'commercial' : 'grossiste'})`} />
          <Info l="Véhicule" v={c.vehicle_immatriculation ? `${c.vehicle_immatriculation}${c.vehicle_marque ? ' — ' + c.vehicle_marque : ''}` : '—'} />
          <Info l={`Remplissage (${unite}s)`} v={c.capacite_figee ? `${fmt(totalQ)} / ${fmt(c.capacite_figee)} (${c.taux_remplissage}%)` : `${fmt(totalQ)} — capacité non définie`} />
          <Info l="Montant total" v={`${fmt(c.montant_total)} GNF`} />
          <Info l="Créé par" v={c.created_by_nom} />
          {c.motif_sous_charge && <Info l="Motif sous-charge" v={c.motif_sous_charge} />}
        </div>

        <div className="table-wrap">
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Produit</th><th>BU</th><th>Qté ({unite}s)</th><th style={{ textAlign: 'right' }}>Prix unitaire</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
            <tbody>
              {(c.lignes || []).length === 0 ? <tr><td colSpan={5}>Aucune ligne.</td></tr>
                : c.lignes.map(l => (
                  <tr key={l.id}>
                    <td>{l.libelle_fige}</td>
                    <td>{l.business_unit_nom || '—'}</td>
                    <td>{fmt(l.quantite)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(l.prix_unitaire_fige)} GNF</td>
                    <td style={{ textAlign: 'right' }}>{fmt(l.montant_ligne)} GNF</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={2}>Total</td><td>{fmt(totalQ)} {unite}s</td><td></td>
                <td style={{ textAlign: 'right' }}>{fmt(c.montant_total)} GNF</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
    </div>
  );
}
