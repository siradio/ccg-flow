import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import DsiSubnav from './DsiSubnav';
import { ProgressBar, ProjetForm, PROJ_STATUTS } from './ProjetsList.jsx';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR'));
const TASK_STATUTS = [['a_faire', 'À faire'], ['en_cours', 'En cours'], ['bloque', 'Bloqué'], ['termine', 'Terminé']];

export default function ProjetDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canEdit = hasSubModuleLevel(user, 'dsi.projets', 'edition');
  const [p, setP] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newMember, setNewMember] = useState('');
  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');
  const load = () => client.get(`/dsi/projects/${id}`).then(r => setP(r.data)).catch(e => setError(e.response?.data?.error || 'Erreur.'));
  useEffect(() => { load(); client.get('/dsi/projects/users').then(r => setUsers(r.data)).catch(() => {}); /* eslint-disable-next-line */ }, [id]);

  if (error && !p) return <div><DsiSubnav /><div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div></div>;
  if (!p) return <div><DsiSubnav /><p>{t('dsi.loading')}</p></div>;
  const statutLabel = (v) => (PROJ_STATUTS.find(s => s[0] === v)?.[1] || v);
  const taskLabel = (v) => (TASK_STATUTS.find(s => s[0] === v)?.[1] || v);
  const Row = ({ label, children }) => (<><span style={{ color: 'var(--color-text-muted)' }}>{label}</span><span>{children}</span></>);

  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{p.code} · {p.nom}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>{t('common.edit')}</button>}
          <Link to="/dsi/projets" className="btn btn-secondary btn-sm">{t('dsi.action.backList')}</Link>
        </div>
      </div>

      <section className="card" style={{ maxWidth: 900, marginTop: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '8px 16px', fontSize: 14 }}>
          <Row label={t('dsi.proj.statut')}>{statutLabel(p.statut)}</Row>
          <Row label={t('dsi.proj.responsable')}>{p.responsable_nom || '—'}</Row>
          <Row label={t('dsi.proj.sponsor')}>{p.sponsor_nom || '—'}</Row>
          <Row label={t('dsi.eq.entity')}>{p.entity_code || '—'}</Row>
          <Row label={t('dsi.proj.dateDebut')}>{dfmt(p.date_debut)}</Row>
          <Row label={t('dsi.proj.echeance')}>{dfmt(p.date_fin_prevue)}</Row>
          <Row label={t('dsi.proj.budgetPrev')}>{money(p.budget_prevu)}</Row>
          <Row label={t('dsi.proj.budgetCons')}>{money(p.budget_consomme)}</Row>
        </div>
        <div style={{ marginTop: 12, maxWidth: 320 }}><ProgressBar pct={p.avancement_pct} /></div>
        {p.description && <p style={{ marginTop: 12, fontSize: 14, whiteSpace: 'pre-wrap' }}>{p.description}</p>}
      </section>

      <section className="card" style={{ maxWidth: 900, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('dsi.proj.tasks')}</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('dsi.proj.task')}</th><th>{t('dsi.proj.responsable')}</th><th>{t('dsi.proj.echeance')}</th><th>{t('dsi.proj.statut')}</th><th>{t('dsi.proj.avancement')}</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {(p.tasks || []).map(tk => (
                <tr key={tk.id}>
                  <td>{tk.libelle}</td><td>{tk.responsable_nom || '—'}</td><td>{dfmt(tk.echeance)}</td>
                  <td>{canEdit ? (
                    <select value={tk.statut} onChange={e => client.put(`/dsi/projects/tasks/${tk.id}`, { statut: e.target.value }).then(load)}>
                      {TASK_STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : taskLabel(tk.statut)}</td>
                  <td style={{ minWidth: 100 }}><ProgressBar pct={tk.avancement_pct} /></td>
                  {canEdit && <td><button className="btn btn-danger btn-sm" onClick={() => client.delete(`/dsi/projects/tasks/${tk.id}`).then(load)}>×</button></td>}
                </tr>
              ))}
              {(p.tasks || []).length === 0 && <tr><td className="empty-row" colSpan={canEdit ? 6 : 5}>{t('dsi.proj.noTask')}</td></tr>}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder={t('dsi.proj.addTask')} style={{ flex: 1 }} />
            <button className="btn btn-secondary btn-sm" disabled={!newTask.trim()} onClick={() => client.post(`/dsi/projects/${id}/tasks`, { libelle: newTask }).then(() => { setNewTask(''); load(); })}>{t('common.add')}</button>
          </div>
        )}
      </section>

      <section className="card" style={{ maxWidth: 900, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('dsi.proj.team')}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(p.members || []).map(m => (
            <span key={m.id} style={{ background: 'var(--color-hover)', borderRadius: 12, padding: '4px 10px', fontSize: 13 }}>
              {m.nom}{m.role_projet ? ` · ${m.role_projet}` : ''}{canEdit && <button className="link-button" style={{ marginLeft: 6 }} onClick={() => client.delete(`/dsi/projects/members/${m.id}`).then(load)}>×</button>}
            </span>
          ))}
          {(p.members || []).length === 0 && <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('dsi.proj.noMember')}</span>}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, maxWidth: 360 }}>
            <SearchableSelect value={newMember} onChange={v => setNewMember(v ?? '')} options={users} getLabel={o => o.nom} placeholder={t('dsi.proj.addMember')} />
            <button className="btn btn-secondary btn-sm" disabled={!newMember} onClick={() => client.post(`/dsi/projects/${id}/members`, { user_id: newMember }).then(() => { setNewMember(''); load(); })}>{t('common.add')}</button>
          </div>
        )}
      </section>

      {editing && <ProjetForm initial={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </div>
  );
}
