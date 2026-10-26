import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

// Onglet « Évaluations » de la fiche employé : historique des fiches d'évaluation de l'employé,
// avec lien vers le détail et téléchargement du PDF des fiches finalisées.
const STATUT_LABEL = { brouillon: 'Brouillon', auto_evaluation: 'Auto-évaluation', evaluation_manager: 'Évaluation manager', avis_rh: 'Avis RH', cloturee: 'Finalisée', annulee: 'Annulée' };

export default function EmployeeEvaluations({ employeeId }) {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!employeeId) return;
    client.get(`/rh/evaluation/fiches/by-employee/${employeeId}`)
      .then(r => { setRows(r.data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [employeeId]);

  async function openPdf(id) {
    setErr('');
    try { const r = await client.get(`/rh/evaluation/fiches/${id}/pdf`, { responseType: 'blob' }); const url = URL.createObjectURL(r.data); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch { setErr('PDF indisponible (disponible après finalisation).'); }
  }

  if (!loaded) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ marginBottom: 8 }}>Évaluations</h3>
      {err && <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{err}</p>}
      {rows.length === 0
        ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Aucune évaluation pour cet employé.</p>
        : (
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>N°</th><th>Année</th><th>Statut</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id}>
                  <td><button type="button" onClick={() => nav(`/rh/evaluation/fiches/${e.id}`)} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>{e.numero}</button></td>
                  <td>{e.annee}</td>
                  <td>{STATUT_LABEL[e.statut] || e.statut}</td>
                  <td>{e.note_globale_manager != null ? `${e.note_globale_manager}/${e.echelle_max}` : '—'}</td>
                  <td>{e.statut === 'cloturee' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openPdf(e.id)}>PDF</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}
