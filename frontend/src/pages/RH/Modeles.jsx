import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import RhSubnav, { canValidateRh } from './RhSubnav';

// Modèles d'évaluation réutilisables (créés par RH ou manager). Liste + accès au builder.
export default function Modeles() {
  const { user } = useAuth();
  const nav = useNavigate();
  const canManage = canValidateRh(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    client.get('/rh/evaluation/templates').then(r => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function remove(id, nom) {
    if (!window.confirm(`Supprimer le modèle « ${nom} » ?`)) return;
    try { await client.delete(`/rh/evaluation/templates/${id}`); load(); }
    catch (e) { window.alert(e?.response?.data?.error || 'Erreur.'); }
  }

  return (
    <div>
      <RhSubnav />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Modèles d'évaluation</h2>
          {canManage && <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => nav('/rh/evaluation/modeles/new')}>+ Nouveau modèle</button>}
        </div>
        <div className="table-wrap">
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Nom</th><th>Poste cible</th><th>Compétences</th><th>Barème</th><th>Créé par</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6}>Chargement…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={6}>Aucun modèle. Créez-en un pour préparer vos fiches d'évaluation.</td></tr>
                  : rows.map(t => (
                    <tr key={t.id}>
                      <td>{t.nom}{!t.actif && <span style={{ color: 'var(--color-text-muted)' }}> (inactif)</span>}</td>
                      <td>{t.poste_cible || '—'}</td>
                      <td>{t.nb_items}</td>
                      <td>1 → {t.echelle_max}</td>
                      <td>{t.created_by_nom || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {canManage && <button className="btn btn-secondary btn-sm" onClick={() => nav(`/rh/evaluation/modeles/${t.id}`)}>Modifier</button>}{' '}
                        {canManage && <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(t.id, t.nom)}>Suppr.</button>}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
