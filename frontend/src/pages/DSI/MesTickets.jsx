import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import Loading from '../../components/Loading';
import DsiSubnav from './DsiSubnav';
import { TicketStatutBadge } from './dsiLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

// Espace salarié — la liste de mes tickets (sans informations internes DSI).
export default function MesTickets() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState(null);
  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');
  useEffect(() => { client.get('/dsi/my/tickets').then(r => setItems(r.data.items || [])).catch(() => setItems([])); }, []);
  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('dsi.myTickets.title')}</h1>
        <Link to="/dsi/signaler" className="btn btn-primary">{t('dsi.report.title')}</Link>
      </div>
      {items === null ? <Loading /> : (
        <div className="card" style={{ padding: 0, marginTop: 14 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('dsi.tk.ref')}</th><th>{t('dsi.tk.objet')}</th><th>{t('dsi.tk.categorie')}</th><th>{t('dsi.tk.statut')}</th><th>{t('dsi.tk.cree')}</th><th /></tr></thead>
              <tbody>
                {items.map(tk => (
                  <tr key={tk.id}>
                    <td><Link to={`/dsi/mes-tickets/${tk.id}`}><strong>{tk.reference}</strong></Link></td>
                    <td>{tk.objet}</td>
                    <td>{tk.categorie || '—'}</td>
                    <td><TicketStatutBadge statut={tk.statut} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{dfmt(tk.created_at)}</td>
                    <td><Link to={`/dsi/mes-tickets/${tk.id}`} className="btn btn-secondary btn-sm">{t('dsi.action.open')}</Link></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td className="empty-row" colSpan={6}>{t('dsi.myTickets.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
