import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import RhSubnav, { canValidateRh, canSeeAllRh } from './RhSubnav';

const STATUT_LABEL = { brouillon: 'Brouillon', auto_evaluation: 'Auto-évaluation', evaluation_manager: 'Évaluation manager', avis_rh: 'Avis RH', cloturee: 'Finalisée', annulee: 'Annulée' };
const STATUT_COLOR = { brouillon: '#6b7280', auto_evaluation: '#b45309', evaluation_manager: '#2454e0', avis_rh: '#7c3aed', cloturee: '#128a54', annulee: '#6b7280' };

export default function Evaluations() {
  const { user } = useAuth();
  const nav = useNavigate();
  const isManager = canValidateRh(user);
  const isRh = canSeeAllRh(user);
  const [scope, setScope] = useState('mine');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [team, setTeam] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ campaign_id: '', employee_id: '', template_id: '' });
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    client.get('/rh/evaluation/fiches', { params: { scope } }).then(r => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);
  useEffect(() => {
    if (!isManager) return;
    client.get('/rh/evaluation/campaigns', { params: { statut: 'ouverte' } }).then(r => setCampaigns(r.data)).catch(() => {});
    client.get('/rh/my-team').then(r => setTeam(r.data)).catch(() => {});
    client.get('/rh/evaluation/templates', { params: { actif: 1 } }).then(r => setTemplates(r.data)).catch(() => {});
  }, [isManager]);

  function onCampaign(cid) {
    const c = campaigns.find(x => String(x.id) === String(cid));
    setForm(f => ({ ...f, campaign_id: cid, template_id: c?.template_defaut_id ? String(c.template_defaut_id) : f.template_id }));
  }
  async function create() {
    setError('');
    if (!form.employee_id) { setError('Sélectionnez un employé.'); return; }
    if (!form.template_id) { setError('Sélectionnez un modèle.'); return; }
    try {
      const r = await client.post('/rh/evaluation/fiches', { campaign_id: form.campaign_id || null, employee_id: Number(form.employee_id), template_id: Number(form.template_id) });
      nav(`/rh/evaluation/fiches/${r.data.id}`);
    } catch (e) { setError(e?.response?.data?.error || 'Erreur.'); }
  }

  const tabs = [['mine', 'Mes évaluations']];
  if (isManager) tabs.push(['team', 'Mon équipe']);
  if (isRh) tabs.push(['all', 'Toutes']);

  return (
    <div>
      <RhSubnav />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Évaluations</h2>
          {isManager && <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShow(s => !s)}>{show ? 'Annuler' : '+ Nouvelle fiche'}</button>}
        </div>

        {show && isManager && (
          <div className="card" style={{ marginBottom: 16, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <label>Campagne<select value={form.campaign_id} onChange={e => onCampaign(e.target.value)} style={{ display: 'block', width: '100%' }}>
              <option value="">— hors campagne —</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.libelle} ({c.annee})</option>)}
            </select></label>
            <label>Employé<select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} style={{ display: 'block', width: '100%' }}>
              <option value="">— choisir —</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.matricule ? m.matricule + ' — ' : ''}{m.prenom} {m.nom}</option>)}
            </select></label>
            <label>Modèle<select value={form.template_id} onChange={e => setForm({ ...form, template_id: e.target.value })} style={{ display: 'block', width: '100%' }}>
              <option value="">— choisir —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
            </select></label>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={create}>Créer la fiche</button>
              {error && <span style={{ color: 'var(--color-danger)' }}>{error}</span>}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {tabs.map(([k, l]) => <button key={k} className={scope === k ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setScope(k)}>{l}</button>)}
        </div>

        <div className="table-wrap">
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>N°</th><th>Employé</th><th>Année</th><th>Campagne</th><th>Statut</th><th>Note</th><th>Date</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7}>Chargement…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={7}>Aucune évaluation.</td></tr>
                  : rows.map(e => (
                    <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/rh/evaluation/fiches/${e.id}`)}>
                      <td>{e.numero}</td>
                      <td>{e.employe_prenom} {e.employe_nom}</td>
                      <td>{e.annee}</td>
                      <td>{e.campagne_libelle || '—'}</td>
                      <td><span className="badge" style={{ background: STATUT_COLOR[e.statut] || '#6b7280', color: '#fff' }}>{STATUT_LABEL[e.statut] || e.statut}</span></td>
                      <td>{e.note_globale_manager != null ? `${e.note_globale_manager}/${e.echelle_max}` : '—'}</td>
                      <td style={{ fontSize: 12 }}>{(e.created_at || '').slice(0, 10)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
