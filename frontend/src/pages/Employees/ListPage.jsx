import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { StatutBadge } from './statutBadge.jsx';
import ReferentialsSubnav from '../Referentials/ReferentialsSubnav';
import { useI18n } from '../../i18n/I18nContext';

export default function ListPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canWrite = hasSubModuleLevel(user, 'rh', 'ajout');
  const [employees, setEmployees] = useState([]);
  const [entities, setEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', entity_id: '', business_unit_id: '', statut: '' });

  useEffect(() => {
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filters.q) params.q = filters.q;
    if (filters.entity_id) params.entity_id = filters.entity_id;
    if (filters.business_unit_id) params.business_unit_id = filters.business_unit_id;
    if (filters.statut) params.statut = filters.statut;
    const timer = setTimeout(() => {
      client.get('/employees', { params }).then(res => setEmployees(res.data)).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [filters]);

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }));
  }

  return (
    <div>
      <ReferentialsSubnav />
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('refx.nav.employees')}</h1>
          <p className="page-subtitle">{t('emp.count', { n: employees.length })}{loading ? '…' : ''}</p>
        </div>
        {canWrite && <Link to="/employees/new" className="btn btn-primary">{t('emp.newEmployee')}</Link>}
      </div>

      <div className="form-inline" style={{ marginBottom: 16 }}>
        <input
          placeholder={t('emp.searchPlaceholder')}
          value={filters.q}
          onChange={e => setFilter('q', e.target.value)}
          style={{ minWidth: 260 }}
        />
        <select value={filters.entity_id} onChange={e => setFilter('entity_id', e.target.value)}>
          <option value="">{t('emp.allEntities')}</option>
          {entities.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
        <select value={filters.business_unit_id} onChange={e => setFilter('business_unit_id', e.target.value)}>
          <option value="">{t('cockpit.allBu')}</option>
          {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        <select value={filters.statut} onChange={e => setFilter('statut', e.target.value)}>
          <option value="">{t('emp.allStatuses')}</option>
          <option value="actif">{t('emp.statut.actif')}</option>
          <option value="inactif">{t('emp.statut.inactif')}</option>
          <option value="sorti">{t('emp.statut.sorti')}</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('emp.th.matricule')}</th>
                <th>{t('refx.f.nom')}</th>
                <th>{t('emp.th.poste')}</th>
                <th>{t('emp.th.departement')}</th>
                <th>{t('emp.th.entity')}</th>
                <th>{t('stockreleve.bu')}</th>
                <th>{t('emp.th.site')}</th>
                <th>{t('emp.th.statut')}</th>
                <th>{t('emp.th.seniority')}</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id}>
                  <td>{emp.matricule || '—'}</td>
                  <td>{emp.prenom} {emp.nom}</td>
                  <td>{emp.poste || '—'}</td>
                  <td>{emp.departement || '—'}</td>
                  <td>{emp.entity_code}</td>
                  <td>{emp.business_unit_nom || '—'}</td>
                  <td>{emp.site_nom || '—'}</td>
                  <td><StatutBadge statut={emp.statut} /></td>
                  <td>{emp.anciennete_annees != null ? t('emp.years', { n: emp.anciennete_annees }) : '—'}</td>
                  {canWrite && <td><Link to={`/employees/${emp.id}`} className="btn btn-secondary btn-sm">{t('common.edit')}</Link></td>}
                </tr>
              ))}
              {!loading && employees.length === 0 && (
                <tr><td className="empty-row" colSpan={canWrite ? 10 : 9}>{t('emp.noneFiltered')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
