import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import RhSubnav, { canManageRhTypes } from './RhSubnav';

// Campagnes d'évaluation — ouvertes/clôturées par les RH.
export default function Campagnes() {
  const { user } = useAuth();
  const isRh = canManageRhTypes(user);
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ libelle: '', annee: new Date().getFullYear(), date_debut: '', date_fin: '', echelle_max: 5, template_defaut_id: '' });
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [gening, setGening] = useState(0);

  function load() { client.get('/rh/evaluation/campaigns').then(r => setRows(r.data)).catch(() => setRows([])); }
  useEffect(() => { load(); client.get('/rh/evaluation/templates', { params: { actif: 1 } }).then(r => setTemplates(r.data)).catch(() => {}); }, []);

  async function create() {
    setError('');
    if (!form.libelle.trim()) { setError('Libellé obligatoire.'); return; }
    try {
      await client.post('/rh/evaluation/campaigns', { ...form, template_defaut_id: form.template_defaut_id || null });
      setShow(false); setForm({ libelle: '', annee: new Date().getFullYear(), date_debut: '', date_fin: '', echelle_max: 5, template_defaut_id: '' }); load();
    } catch (e) { setError(e?.response?.data?.error || 'Erreur.'); }
  }
  async function toggleStatut(c) {
    try { await client.put(`/rh/evaluation/campaigns/${c.id}`, { statut: c.statut === 'ouverte' ? 'close' : 'ouverte' }); load(); }
    catch (e) { window.alert(e?.response?.data?.error || 'Erreur.'); }
  }
  async function generate(c) {
    if (!window.confirm(`Générer les fiches pour « ${c.libelle} » ?\nUne fiche brouillon sera créée pour chaque employé actif ayant un manager, à partir du modèle par défaut.`)) return;
    setReport(null); setGening(c.id);
    try { const r = await client.post(`/rh/evaluation/campaigns/${c.id}/generate`, {}); setReport({ campagne: c.libelle, ...r.data }); load(); }
    catch (e) { window.alert(e?.response?.data?.error || 'Erreur.'); }
    finally { setGening(0); }
  }

  return (
    <div>
      <RhSubnav />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Campagnes d'évaluation</h2>
          {isRh && <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShow(s => !s)}>{show ? 'Annuler' : '+ Nouvelle campagne'}</button>}
        </div>

        {show && isRh && (
          <div className="card" style={{ marginBottom: 16, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <label>Libellé<input value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} style={{ display: 'block', width: '100%' }} /></label>
            <label>Année<input type="number" value={form.annee} onChange={e => setForm({ ...form, annee: e.target.value })} style={{ display: 'block', width: 110 }} /></label>
            <label>Barème (max)<input type="number" min="2" max="10" value={form.echelle_max} onChange={e => setForm({ ...form, echelle_max: e.target.value })} style={{ display: 'block', width: 90 }} /></label>
            <label>Du<input type="date" value={form.date_debut} onChange={e => setForm({ ...form, date_debut: e.target.value })} style={{ display: 'block' }} /></label>
            <label>Au<input type="date" value={form.date_fin} onChange={e => setForm({ ...form, date_fin: e.target.value })} style={{ display: 'block' }} /></label>
            <label>Modèle par défaut<select value={form.template_defaut_id} onChange={e => setForm({ ...form, template_defaut_id: e.target.value })} style={{ display: 'block', width: '100%' }}>
              <option value="">— aucun —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
            </select></label>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={create}>Créer la campagne</button>
              {error && <span style={{ color: 'var(--color-danger)' }}>{error}</span>}
            </div>
          </div>
        )}

        {report && (
          <div className="alert alert-success" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <strong>Campagne « {report.campagne} »</strong> — {report.created} fiche(s) créée(s), {report.skipped} ignorée(s) sur {report.total}.
              {report.errors && report.errors.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  À compléter : {report.errors.length} employé(s) sans manager/compte lié (fiche non générée).
                </div>
              )}
            </div>
            <button onClick={() => setReport(null)} className="btn-icon" aria-label="Fermer">×</button>
          </div>
        )}

        <div className="table-wrap">
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Libellé</th><th>Année</th><th>Période</th><th>Barème</th><th>Modèle défaut</th><th>Fiches</th><th>Statut</th>{isRh && <th></th>}</tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={isRh ? 8 : 7}>Aucune campagne.</td></tr>
                : rows.map(c => (
                  <tr key={c.id}>
                    <td>{c.libelle}</td><td>{c.annee}</td>
                    <td style={{ fontSize: 13 }}>{(c.date_debut || '—')} → {(c.date_fin || '—')}</td>
                    <td>1 → {c.echelle_max}</td><td>{c.template_defaut_nom || '—'}</td><td>{c.nb_fiches}</td>
                    <td><span className="badge" style={{ background: c.statut === 'ouverte' ? '#128a54' : '#6b7280', color: '#fff' }}>{c.statut === 'ouverte' ? 'Ouverte' : 'Close'}</span></td>
                    {isRh && <td style={{ whiteSpace: 'nowrap' }}>
                      {c.statut === 'ouverte' && <button className="btn btn-primary btn-sm" disabled={gening === c.id} onClick={() => generate(c)}>{gening === c.id ? '…' : 'Générer les fiches'}</button>}{' '}
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleStatut(c)}>{c.statut === 'ouverte' ? 'Clôturer' : 'Rouvrir'}</button>
                    </td>}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
