import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel, isSuperAdmin } from '../../auth/AuthContext';
import { StatutBadge } from './statutBadge.jsx';
import ReferentialsSubnav from '../Referentials/ReferentialsSubnav';
import { useSort, SortTh } from '../../components/useSort.jsx';
import { useI18n } from '../../i18n/I18nContext';

export default function ListPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canWrite = hasSubModuleLevel(user, 'rh', 'ajout');
  const admin = isSuperAdmin(user);
  const { sort, by, apply } = useSort();
  const [employees, setEmployees] = useState([]);
  const [entities, setEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alertCfg, setAlertCfg] = useState({ actif: false, jours: '30', emails: '' });
  const [alertMsg, setAlertMsg] = useState('');
  const [filters, setFilters] = useState({ q: '', entity_id: '', business_unit_id: '', statut: '' });

  useEffect(() => {
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
    if (admin) {
      client.get('/settings').then(r => setAlertCfg({
        actif: String(r.data.permis_alert_actif) === 'true',
        jours: r.data.permis_alert_jours || '30',
        emails: r.data.permis_alert_emails || '',
      })).catch(() => {});
    }
  }, [admin]);

  async function saveAlertCfg() {
    setAlertMsg('');
    try {
      await client.put('/settings/permis_alert_actif', { value: alertCfg.actif ? 'true' : 'false' });
      await client.put('/settings/permis_alert_jours', { value: String(alertCfg.jours || '30') });
      await client.put('/settings/permis_alert_emails', { value: alertCfg.emails || '—' });
      setAlertMsg(t('emp.alert.saved'));
    } catch (err) { setAlertMsg(err.response?.data?.error || t('emp.alert.saveFailed')); }
  }
  async function sendAlertNow() {
    setAlertMsg(t('emp.alert.sending'));
    try {
      const { data } = await client.post('/employees/permis-alert/test-alert');
      setAlertMsg(data.sent ? t('emp.alert.sent', { count: data.count, to: data.to.join(', ') }) : t('emp.alert.nothing'));
    } catch (err) { setAlertMsg(err.response?.data?.error || t('emp.alert.sendFailed')); }
  }

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
                <SortTh label={t('emp.th.matricule')} colKey="matricule" get={r => r.matricule} sort={sort} by={by} />
                <SortTh label={t('refx.f.nom')} colKey="nom" get={r => `${r.prenom || ''} ${r.nom || ''}`.trim()} sort={sort} by={by} />
                <SortTh label={t('emp.th.poste')} colKey="poste" get={r => r.poste} sort={sort} by={by} />
                <SortTh label={t('emp.th.departement')} colKey="departement" get={r => r.departement} sort={sort} by={by} />
                <SortTh label={t('emp.th.entity')} colKey="entity" get={r => r.entity_code} sort={sort} by={by} />
                <SortTh label={t('stockreleve.bu')} colKey="bu" get={r => r.business_unit_nom} sort={sort} by={by} />
                <SortTh label={t('emp.th.site')} colKey="site" get={r => r.site_nom} sort={sort} by={by} />
                <SortTh label={t('emp.th.statut')} colKey="statut" get={r => r.statut} sort={sort} by={by} />
                <SortTh label={t('emp.th.seniority')} colKey="seniority" get={r => (r.anciennete_annees == null ? null : Number(r.anciennete_annees))} sort={sort} by={by} />
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {apply(employees).map(emp => (
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

      {admin && (
        <section className="card" style={{ marginTop: 16, maxWidth: 720 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('emp.alert.title')}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>{t('emp.alert.intro')}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ alignSelf: 'center' }}>
              <span><input type="checkbox" checked={alertCfg.actif} onChange={e => setAlertCfg(c => ({ ...c, actif: e.target.checked }))} /> {t('emp.alert.enabled')}</span>
            </label>
            <label className="field" style={{ width: 120 }}>{t('emp.alert.days')}
              <input type="number" min="1" value={alertCfg.jours} onChange={e => setAlertCfg(c => ({ ...c, jours: e.target.value }))} />
            </label>
            <label className="field" style={{ flex: '1 1 260px' }}>{t('emp.alert.recipients')}
              <input value={alertCfg.emails} placeholder="rh@ccg.com, dg@ccg.com" onChange={e => setAlertCfg(c => ({ ...c, emails: e.target.value }))} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={saveAlertCfg}>{t('common.save')}</button>
            <button className="btn btn-secondary" onClick={sendAlertNow}>{t('emp.alert.sendNow')}</button>
            {alertMsg && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{alertMsg}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
