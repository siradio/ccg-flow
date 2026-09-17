import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import Loading from '../../components/Loading';
import Pagination from '../../components/Pagination.jsx';
import DsiSubnav from './DsiSubnav';
import { beneficiaireLabel } from './dsiLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

// Affectations en cours : vue centrée bénéficiaire (équipements actuellement affectés). Les actions
// Affecter/Transférer/Restituer se font depuis la fiche de l'équipement.
export default function Affectations() {
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');

  useEffect(() => {
    const params = { statut: 'affecte', page, pageSize: 20 };
    if (q.trim()) params.q = q.trim();
    const timer = setTimeout(() => { client.get('/dsi/equipment', { params }).then(r => setData(r.data)).catch(() => setData({ items: [], total: 0, page: 1, pageSize: 20 })); }, 250);
    return () => clearTimeout(timer);
  }, [page, q]);

  const items = data?.items || [];
  return (
    <div>
      <DsiSubnav />
      <h1 className="page-title" style={{ marginBottom: 12 }}>{t('dsi.nav.affectations')}</h1>
      <div className="form-inline" style={{ marginBottom: 12 }}>
        <input type="search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder={t('dsi.parc.search')} style={{ minWidth: 260 }} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {!data ? <Loading /> : (
            <table>
              <thead><tr>
                <th>{t('dsi.eq.numero')}</th><th>{t('dsi.eq.designation')}</th><th>{t('dsi.assign.beneficiaire')}</th>
                <th>{t('dsi.assign.type')}</th><th>{t('dsi.eq.entity')}</th><th>{t('dsi.eq.site')}</th><th />
              </tr></thead>
              <tbody>
                {items.map(e => (
                  <tr key={e.id}>
                    <td><Link to={`/dsi/parc/${e.id}`}><strong>{e.numero_inventaire}</strong></Link></td>
                    <td>{e.designation}</td>
                    <td>{e.assigned_employee_nom || e.assigned_bu_nom || e.assigned_entity_code || e.assigned_site_nom || '—'}</td>
                    <td>{beneficiaireLabel(e.beneficiaire_type)}</td>
                    <td>{e.entity_code || '—'}</td>
                    <td>{e.site_nom || '—'}</td>
                    <td><Link to={`/dsi/parc/${e.id}`} className="btn btn-secondary btn-sm">{t('dsi.action.open')}</Link></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td className="empty-row" colSpan={7}>{t('dsi.assign.none')}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
    </div>
  );
}
