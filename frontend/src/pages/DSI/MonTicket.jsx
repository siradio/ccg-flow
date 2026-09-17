import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';
import DsiSubnav from './DsiSubnav';
import { TicketStatutBadge } from './dsiLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

const ACTION_LABEL = { creation: 'Création', statut: 'Mise à jour', resolution: 'Résolution', cloture: 'Clôture', reouverture: 'Réouverture', commentaire: 'Commentaire' };

// Espace salarié — détail d'un de mes tickets : suivi (timeline publique) + commentaire.
export default function MonTicket() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const [tk, setTk] = useState(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const dtfmt = (d) => (d ? new Date(d).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');
  const load = () => client.get(`/dsi/my/tickets/${id}`).then(r => setTk(r.data)).catch(e => setError(e.response?.data?.error || 'Erreur.'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (error && !tk) return <div><DsiSubnav /><div className="alert alert-danger" style={{ maxWidth: 640 }}>{error}</div></div>;
  if (!tk) return <div><DsiSubnav /><p>{t('dsi.loading')}</p></div>;

  async function send() {
    setBusy(true); setError('');
    try { await client.post(`/dsi/my/tickets/${id}/comment`, { comment }); setComment(''); await load(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur.'); } finally { setBusy(false); }
  }

  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{tk.reference} <TicketStatutBadge statut={tk.statut} /></h1>
        <Link to="/dsi/mes-tickets" className="btn btn-secondary btn-sm">{t('dsi.action.backList')}</Link>
      </div>
      <section className="card" style={{ maxWidth: 720, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{tk.objet}</h2>
        {tk.description && <p style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{tk.description}</p>}
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('dsi.tk.cree')} : {dtfmt(tk.created_at)}{tk.technician_nom ? ` · ${t('dsi.tk.technicien')} : ${tk.technician_nom}` : ''}</div>
      </section>
      <section className="card" style={{ maxWidth: 720, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('dsi.tk.timeline')}</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {(tk.events || []).map(ev => (
            <li key={ev.id} style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 12, marginLeft: 4, paddingBottom: 12 }}>
              <div style={{ fontSize: 13 }}><strong>{ACTION_LABEL[ev.action] || ev.action}</strong></div>
              {ev.comment && <div style={{ fontSize: 14, marginTop: 2, whiteSpace: 'pre-wrap' }}>{ev.comment}</div>}
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{ev.user_nom || '—'} · {dtfmt(ev.created_at)}</div>
            </li>
          ))}
          {(tk.events || []).length === 0 && <li style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('dsi.tk.noUpdate')}</li>}
        </ul>
        {error && <div className="alert alert-danger" style={{ marginTop: 8 }}>{error}</div>}
        {!['cloture', 'annule'].includes(tk.statut) && (
          <div style={{ marginTop: 10 }}>
            <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder={t('dsi.tk.addComment')} style={{ width: '100%' }} />
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} disabled={busy || !comment.trim()} onClick={send}>{t('dsi.tk.comment')}</button>
          </div>
        )}
      </section>
    </div>
  );
}
