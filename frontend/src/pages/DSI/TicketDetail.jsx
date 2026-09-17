import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import DsiSubnav from './DsiSubnav';
import { TicketStatutBadge, PriorityBadge, SlaBadge, fmtMin } from './dsiLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

const ACTION_LABEL = {
  creation: 'Création', affectation: 'Affectation', statut: 'Changement de statut', priorite: 'Changement de priorité',
  commentaire: 'Commentaire', intervention: 'Intervention', sla_breach: 'Dépassement SLA', resolution: 'Résolution',
  cloture: 'Clôture', reouverture: 'Réouverture',
};
const STATUS_ACTIONS = [
  { to: 'en_cours', label: 'Prendre en charge', from: ['ouvert', 'affecte', 'en_attente'] },
  { to: 'en_attente', label: 'Mettre en attente', from: ['en_cours'] },
  { to: 'resolu', label: 'Résoudre', from: ['en_cours', 'en_attente', 'affecte'] },
  { to: 'cloture', label: 'Clôturer', from: ['resolu'] },
  { to: 'en_cours', label: 'Rouvrir', from: ['resolu', 'cloture'], reopen: true },
  { to: 'annule', label: 'Annuler', from: ['ouvert', 'affecte', 'en_cours', 'en_attente'] },
];

export default function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canEdit = hasSubModuleLevel(user, 'dsi.tickets', 'edition');
  const [tk, setTk] = useState(null);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [prios, setPrios] = useState([]);
  const [tech, setTech] = useState('');
  const [comment, setComment] = useState('');
  const [visib, setVisib] = useState('interne');
  const [busy, setBusy] = useState(false);
  const dtfmt = (d) => (d ? new Date(d).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');

  const load = () => client.get(`/dsi/tickets/${id}`).then(r => { setTk(r.data); setTech(r.data.technician_id || ''); }).catch(e => setError(e.response?.data?.error || 'Erreur.'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    if (!canEdit) return;
    client.get('/dsi/tickets/users').then(r => setUsers(r.data)).catch(() => {});
    client.get('/dsi/referentials/priorities').then(r => setPrios(r.data.map(p => ({ id: p.id, nom: p.libelle })))).catch(() => {});
  }, [canEdit]);

  if (error && !tk) return <div><DsiSubnav /><div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div></div>;
  if (!tk) return <div><DsiSubnav /><p>{t('dsi.loading')}</p></div>;

  const act = async (fn) => { setBusy(true); setError(''); try { await fn(); await load(); } catch (e) { setError(e.response?.data?.error || 'Erreur.'); } finally { setBusy(false); } };
  const Row = ({ label, children }) => (<><span style={{ color: 'var(--color-text-muted)' }}>{label}</span><span>{children}</span></>);
  const sla = tk.sla;

  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {tk.reference} <TicketStatutBadge statut={tk.statut} /> <PriorityBadge libelle={tk.priorite} couleur={tk.priorite_couleur} />
        </h1>
        <Link to="/dsi/tickets" className="btn btn-secondary btn-sm">{t('dsi.action.backList')}</Link>
      </div>
      {error && <div className="alert alert-danger" style={{ maxWidth: 720, marginTop: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 14, marginTop: 14, alignItems: 'start' }}>
        <div>
          <section className="card">
            <h2 style={{ marginTop: 0, fontSize: 15 }}>{tk.objet}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '8px 16px', fontSize: 14 }}>
              <Row label={t('dsi.tk.demandeur')}>{tk.demandeur_nom || '—'}</Row>
              <Row label={t('dsi.tk.technicien')}>{tk.technician_nom || '—'}</Row>
              <Row label={t('dsi.tk.categorie')}>{tk.categorie || '—'}</Row>
              <Row label={t('dsi.tk.type')}>{tk.type_libelle || '—'}</Row>
              <Row label={t('dsi.tk.impact')}>{tk.impact || '—'}</Row>
              <Row label={t('dsi.tk.urgence')}>{tk.urgence || '—'}</Row>
              <Row label={t('dsi.eq.entity')}>{tk.entity_code || '—'}</Row>
              <Row label={t('dsi.eq.site')}>{tk.site_nom || '—'}</Row>
              {tk.equipement_numero && <Row label={t('dsi.tk.equipement')}><Link to={`/dsi/parc/${tk.equipment_id}`}>{tk.equipement_numero}</Link></Row>}
              <Row label={t('dsi.tk.cree')}>{dtfmt(tk.created_at)}</Row>
            </div>
            {tk.description && <p style={{ marginTop: 12, fontSize: 14, whiteSpace: 'pre-wrap' }}>{tk.description}</p>}
          </section>

          <section className="card" style={{ marginTop: 14 }}>
            <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('dsi.tk.timeline')}</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {(tk.events || []).map(ev => (
                <li key={ev.id} style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 12, marginLeft: 4, paddingBottom: 12, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: -5, top: 4, width: 8, height: 8, borderRadius: 4, background: 'var(--color-primary)' }} />
                  <div style={{ fontSize: 13 }}>
                    <strong>{ACTION_LABEL[ev.action] || ev.action}</strong>
                    {ev.to_value && ev.action === 'statut' && ` → ${ev.to_value}`}
                    {ev.visibilite === 'interne' && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--color-text-muted)' }}>({t('dsi.tk.internal')})</span>}
                  </div>
                  {ev.comment && <div style={{ fontSize: 14, marginTop: 2, whiteSpace: 'pre-wrap' }}>{ev.comment}</div>}
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{ev.user_nom || '—'} · {dtfmt(ev.created_at)}</div>
                </li>
              ))}
            </ul>
            {canEdit && (
              <div style={{ marginTop: 10 }}>
                <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder={t('dsi.tk.addComment')} style={{ width: '100%' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                  <select value={visib} onChange={e => setVisib(e.target.value)}>
                    <option value="interne">{t('dsi.tk.internal')}</option>
                    <option value="public">{t('dsi.tk.public')}</option>
                  </select>
                  <button className="btn btn-secondary btn-sm" disabled={busy || !comment.trim()} onClick={() => act(async () => { await client.post(`/dsi/tickets/${id}/comment`, { comment, visibilite: visib }); setComment(''); })}>{t('dsi.tk.comment')}</button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div>
          <section className="card">
            <h2 style={{ marginTop: 0, fontSize: 15 }}>SLA</h2>
            {!sla ? <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('dsi.tk.noSla')}</p> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', fontSize: 14 }}>
                <Row label={t('dsi.tk.slaPec')}><SlaBadge sla={{ resolution: sla.priseEnCharge }} /></Row>
                <Row label={t('dsi.tk.slaRes')}><SlaBadge sla={sla} /></Row>
                {sla.resolution && !sla.resolution.done && <Row label={t('dsi.tk.slaRemaining')}>{fmtMin(sla.resolution.remainingMin)}</Row>}
              </div>
            )}
          </section>

          {canEdit && (
            <section className="card" style={{ marginTop: 14 }}>
              <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('dsi.tk.actions')}</h2>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>{t('dsi.tk.assignTech')}
                <div style={{ display: 'flex', gap: 6 }}>
                  <SearchableSelect value={tech} onChange={v => setTech(v ?? '')} options={users} getLabel={o => o.nom} placeholder="Technicien…" />
                  <button className="btn btn-primary btn-sm" disabled={busy || !tech} onClick={() => act(() => client.post(`/dsi/tickets/${id}/assign`, { technician_id: tech }))}>{t('dsi.action.assign')}</button>
                </div>
              </label>
              <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-muted)', marginTop: 10 }}>{t('dsi.tk.priorite')}
                <select value={tk.priority_id || ''} onChange={e => act(() => client.put(`/dsi/tickets/${id}`, { priority_id: e.target.value || '' }))}>
                  <option value="">—</option>
                  {prios.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                {STATUS_ACTIONS.filter(a => a.from.includes(tk.statut)).map((a, i) => (
                  <button key={i} className="btn btn-secondary btn-sm" disabled={busy}
                    onClick={() => act(() => client.post(`/dsi/tickets/${id}/status`, { statut: a.to }))}>{a.label}</button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
