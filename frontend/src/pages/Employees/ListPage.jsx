import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { StatutBadge } from './statutBadge.jsx';
import ReferentialsSubnav from '../Referentials/ReferentialsSubnav';
import EmployeeFormModal from './FormPage.jsx';
import { useSort, SortTh } from '../../components/useSort.jsx';
import { useI18n } from '../../i18n/I18nContext';

export default function ListPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canWrite = hasSubModuleLevel(user, 'rh', 'ajout');
  // La planification de l'alerte est gérée par le RH ayant le niveau ÉDITION (droit d'ajout/suppression).
  const canManageAlert = hasSubModuleLevel(user, 'rh', 'edition');
  const { sort, by, apply } = useSort();
  const [employees, setEmployees] = useState([]);
  const [entities, setEntities] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alertCfg, setAlertCfg] = useState({ actif: false, jours: '30', emails: '' });
  const [alertMsg, setAlertMsg] = useState('');
  const [filters, setFilters] = useState({ q: '', entity_id: '', business_unit_id: '', statut: '' });
  // Saisie employé en modale : undefined = fermée, null = nouvel employé, id = édition.
  const [formFor, setFormFor] = useState(undefined);
  const [reloadTick, setReloadTick] = useState(0);
  const [toast, setToast] = useState(null);
  function showToast(m) { setToast(m); setTimeout(() => setToast(c => (c === m ? null : c)), 3200); }
  function onFormDone(saved) {
    setFormFor(undefined);
    if (saved) { setReloadTick(t => t + 1); showToast(t('ref.saved')); }
  }

  // Rattachement automatique des comptes (aperçu puis application).
  const [linkPreview, setLinkPreview] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  async function previewLinks() {
    setLinkBusy(true);
    try {
      const { data } = await client.post('/employees/auto-link-users', { apply: false });
      setLinkPreview(data);
    } catch (err) { showToast(err.response?.data?.error || t('emp.autolink.failed')); }
    finally { setLinkBusy(false); }
  }
  async function applyLinks() {
    setLinkBusy(true);
    try {
      const { data } = await client.post('/employees/auto-link-users', { apply: true });
      setLinkPreview(null);
      setReloadTick(v => v + 1);
      showToast(t('emp.autolink.done', { n: data.counts.aLier }));
    } catch (err) { showToast(err.response?.data?.error || t('emp.autolink.failed')); }
    finally { setLinkBusy(false); }
  }

  useEffect(() => {
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
    if (canManageAlert) {
      client.get('/employees/permis-alert/config').then(r => setAlertCfg({
        actif: !!r.data.actif,
        jours: r.data.jours || '30',
        emails: r.data.emails || '',
      })).catch(() => {});
    }
  }, [canManageAlert]);

  async function saveAlertCfg() {
    setAlertMsg('');
    try {
      await client.put('/employees/permis-alert/config', { actif: alertCfg.actif, jours: alertCfg.jours || '30', emails: alertCfg.emails || '' });
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
  }, [filters, reloadTick]);

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }));
  }

  return (
    <div>
      {toast && (
        <div className="alert alert-success" style={{ position: 'fixed', top: 16, right: 16, zIndex: 3000, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          {toast}
        </div>
      )}
      {formFor !== undefined && <EmployeeFormModal employeeId={formFor} onDone={onFormDone} />}
      <ReferentialsSubnav />
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('refx.nav.employees')}</h1>
          <p className="page-subtitle">{t('emp.count', { n: employees.length })}{loading ? '…' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canManageAlert && <button type="button" className="btn btn-secondary" onClick={previewLinks} disabled={linkBusy}>{linkBusy && !linkPreview ? '…' : t('emp.autolink.btn')}</button>}
          {canWrite && <button type="button" className="btn btn-primary" onClick={() => setFormFor(null)}>{t('emp.newEmployee')}</button>}
        </div>
      </div>

      {linkPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflow: 'auto' }} onClick={() => !linkBusy && setLinkPreview(null)}>
          <div className="card" style={{ maxWidth: 720, width: '100%', marginTop: 24 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>{t('emp.autolink.title')}</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>{t('emp.autolink.intro')}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <span className="badge">{t('emp.autolink.toLink', { n: linkPreview.counts.aLier })}</span>
              <span className="badge">{t('emp.autolink.ok', { n: linkPreview.counts.dejaOk })}</span>
              <span className="badge">{t('emp.autolink.ambiguous', { n: linkPreview.counts.ambigus })}</span>
              <span className="badge">{t('emp.autolink.nomatch', { n: linkPreview.counts.sansMatch })}</span>
            </div>
            {linkPreview.linked.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: 13 }}>{t('emp.autolink.toLinkList')}</strong>
                <ul style={{ fontSize: 13, margin: '4px 0 0', paddingLeft: 18, maxHeight: 180, overflow: 'auto' }}>
                  {linkPreview.linked.map((r, i) => <li key={i}>{r.employee} → <b>{r.user}</b> <span style={{ color: 'var(--color-text-muted)' }}>[{r.via}{r.was ? `, remplace ${r.was}` : ''}]</span></li>)}
                </ul>
              </div>
            )}
            {linkPreview.ambiguous.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: 13 }}>{t('emp.autolink.ambiguousList')}</strong>
                <ul style={{ fontSize: 13, margin: '4px 0 0', paddingLeft: 18, maxHeight: 140, overflow: 'auto' }}>
                  {linkPreview.ambiguous.map((r, i) => <li key={i}>{r.employee} : {r.candidates.join(' · ')}</li>)}
                </ul>
              </div>
            )}
            {linkPreview.noMatch.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: 13 }}>{t('emp.autolink.nomatchList')}</strong>
                <ul style={{ fontSize: 13, margin: '4px 0 0', paddingLeft: 18, maxHeight: 120, overflow: 'auto' }}>
                  {linkPreview.noMatch.map((r, i) => <li key={i}>{r.employee}{r.email ? ` — ${r.email}` : ''}</li>)}
                </ul>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={applyLinks} disabled={linkBusy || linkPreview.counts.aLier === 0}>{linkBusy ? '…' : t('emp.autolink.apply', { n: linkPreview.counts.aLier })}</button>
              <button className="btn btn-secondary" onClick={() => setLinkPreview(null)} disabled={linkBusy}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

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
                  {canWrite && <td><button type="button" onClick={() => setFormFor(emp.id)} className="btn btn-secondary btn-sm">{t('common.edit')}</button></td>}
                </tr>
              ))}
              {!loading && employees.length === 0 && (
                <tr><td className="empty-row" colSpan={canWrite ? 10 : 9}>{t('emp.noneFiltered')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canManageAlert && (
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
