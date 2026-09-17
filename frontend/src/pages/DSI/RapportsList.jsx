import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Loading from '../../components/Loading';
import DsiSubnav from './DsiSubnav';
import { useI18n } from '../../i18n/I18nContext';

const MONTHS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const STAT = { brouillon: 'Brouillon', a_valider: 'À valider', valide: 'Validé', diffuse: 'Diffusé' };

export default function RapportsList() {
  const { user } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const canEdit = hasSubModuleLevel(user, 'dsi.rapports', 'edition');
  const [rows, setRows] = useState(null);
  const [entities, setEntities] = useState([]);
  const now = new Date();
  const [g, setG] = useState({ annee: now.getFullYear(), mois: now.getMonth() + 1, entity_id: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => client.get('/dsi/reports').then(r => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { load(); client.get('/entities').then(r => setEntities(r.data)).catch(() => {}); }, []);

  async function generate() {
    setBusy(true); setError('');
    try { const r = await client.post('/dsi/reports/generate', g); nav(`/dsi/rapports/${r.data.id}`); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); setBusy(false); }
  }

  return (
    <div>
      <DsiSubnav />
      <h1 className="page-title" style={{ marginBottom: 12 }}>{t('dsi.rep.title')}</h1>

      {canEdit && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('dsi.rep.generate')}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field">{t('dsi.rep.month')}<select value={g.mois} onChange={e => setG({ ...g, mois: Number(e.target.value) })}>{MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}</select></label>
            <label className="field">{t('dsi.rep.year')}<input type="number" value={g.annee} onChange={e => setG({ ...g, annee: Number(e.target.value) })} style={{ width: 90 }} /></label>
            <label className="field">{t('dsi.rep.scope')}<select value={g.entity_id} onChange={e => setG({ ...g, entity_id: e.target.value })}><option value="">{t('dsi.rep.allEntities')}</option>{entities.map(en => <option key={en.id} value={en.id}>{en.code || en.nom}</option>)}</select></label>
            <button className="btn btn-primary" disabled={busy} onClick={generate}>{busy ? '…' : t('dsi.rep.generateBtn')}</button>
          </div>
          {error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      )}

      {rows === null ? <Loading /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('dsi.rep.period')}</th><th>{t('dsi.rep.scope')}</th><th>{t('dsi.rep.responsable')}</th><th>{t('dsi.rep.statut')}</th><th>{t('dsi.rep.generated')}</th><th /></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td><Link to={`/dsi/rapports/${r.id}`}><strong>{MONTHS[r.mois]} {r.annee}</strong></Link></td>
                    <td>{r.entity_code || t('dsi.rep.allEntities')}</td>
                    <td>{r.responsable_nom || '—'}</td>
                    <td>{STAT[r.statut] || r.statut}</td>
                    <td>{r.genere_le ? new Date(r.genere_le).toLocaleDateString('fr-FR') : '—'}</td>
                    <td><Link to={`/dsi/rapports/${r.id}`} className="btn btn-secondary btn-sm">{t('dsi.action.open')}</Link></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td className="empty-row" colSpan={6}>{t('dsi.rep.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
