import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel, isSuperAdmin } from '../../auth/AuthContext';
import LogistiqueSubnav from './LogistiqueSubnav';
import ReferentialPage from '../Referentials/ReferentialPage';
import { useI18n } from '../../i18n/I18nContext';

const DOC_TYPES = ['Assurance', 'Carte grise', 'Visite technique', 'Vignette', 'Autre'];
const fmtDate = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
function hrefOf(url) { return /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`; }

const FIELDS = [
  { key: 'vehicle_id', labelKey: 'log.f.vehicle_id', type: 'fkSelect', listKey: 'vehicles', required: true },
  { key: 'type', labelKey: 'log.doc.docType', type: 'select', options: DOC_TYPES, optionNs: 'log.docType', required: true, default: 'Assurance' },
  { key: 'numero', labelKey: 'log.doc.number' },
  { key: 'date_debut', labelKey: 'log.f.date_debut', type: 'date' },
  { key: 'date_fin', labelKey: 'log.doc.deadline', type: 'date' },
  { key: 'lien', labelKey: 'log.doc.link' },
  { key: 'notes', labelKey: 'log.doc.notes', type: 'textarea' },
];

// Statut d'échéance selon le nb de jours restants.
function echeanceStatus(jr, t) {
  if (jr < 0) return { label: t('log.doc.expired', { n: -jr }), fg: 'var(--status-red-fg)', bg: 'var(--status-red-bg)' };
  if (jr <= 30) return { label: t('log.doc.daysLeft', { n: jr }), fg: 'var(--status-amber-fg)', bg: 'var(--status-amber-bg)' };
  return { label: t('log.doc.daysLeft', { n: jr }), fg: 'var(--status-green-fg)', bg: 'var(--status-green-bg)' };
}

export default function LogistiqueDocuments() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canView = hasSubModuleLevel(user, 'logistique.parc');
  const admin = isSuperAdmin(user);
  const [tab, setTab] = useState('docs');
  const [vehicles, setVehicles] = useState([]);
  const [echeances, setEcheances] = useState([]);
  const [alertCfg, setAlertCfg] = useState({ actif: false, jours: '30', emails: '' });
  const [alertMsg, setAlertMsg] = useState('');

  useEffect(() => {
    if (!canView) return;
    client.get('/vehicles').then(r => setVehicles(r.data.map(v => ({ id: v.id, nom: `${v.immatriculation}${v.marque ? ' — ' + v.marque : ''}` })))).catch(() => {});
    if (admin) {
      client.get('/settings').then(r => setAlertCfg({
        actif: String(r.data.echeance_alert_actif) === 'true',
        jours: r.data.echeance_alert_jours || '30',
        emails: r.data.echeance_alert_emails || '',
      })).catch(() => {});
    }
  }, [canView, admin]);

  useEffect(() => {
    if (canView && tab === 'echeances') client.get('/vehicle-documents/echeances').then(r => setEcheances(r.data)).catch(() => {});
  }, [canView, tab]);

  async function saveAlertCfg() {
    setAlertMsg('');
    try {
      await client.put('/settings/echeance_alert_actif', { value: alertCfg.actif ? 'true' : 'false' });
      await client.put('/settings/echeance_alert_jours', { value: String(alertCfg.jours || '30') });
      await client.put('/settings/echeance_alert_emails', { value: alertCfg.emails || '—' });
      setAlertMsg(t('log.doc.alertsSaved'));
    } catch (err) { setAlertMsg(err.response?.data?.error || t('log.doc.saveFailed')); }
  }
  async function sendAlertNow() {
    setAlertMsg(t('log.doc.sending'));
    try {
      const { data } = await client.post('/vehicle-documents/echeances/test-alert');
      setAlertMsg(data.sent ? t('log.doc.emailSent', { count: data.count, to: data.to.join(', ') }) : t('log.doc.nothingToSend'));
    } catch (err) { setAlertMsg(err.response?.data?.error || t('log.doc.sendFailed')); }
  }

  if (!canView) return <div><LogistiqueSubnav /><p>{t('log.notGranted')}</p></div>;

  // FIELDS traduits : libellés via labelKey (géré par ReferentialPage) + options du select via optionNs.
  const docFields = FIELDS.map(f => (f.optionNs && f.options
    ? { ...f, optionLabels: Object.fromEntries(f.options.map(o => [o, t(`${f.optionNs}.${o}`)])) }
    : f));

  return (
    <div>
      <LogistiqueSubnav />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'docs' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('docs')}>{t('log.doc.tabDocs')}</button>
        <button className={`btn btn-sm ${tab === 'echeances' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('echeances')}>{t('log.doc.tabDeadlines')}</button>
      </div>

      {tab === 'docs' ? (
        <ReferentialPage
          title={t('log.doc.title')}
          endpoint="/vehicle-documents"
          fields={docFields}
          filters={['vehicle_id', 'type']}
          lists={{ vehicles }}
          canAdd={hasSubModuleLevel(user, 'logistique.parc', 'ajout')}
          canEdit={hasSubModuleLevel(user, 'logistique.parc', 'edition')}
        />
      ) : (
        <div>
          <h1 className="page-title" style={{ margin: '0 0 4px' }}>{t('log.doc.deadlines')}</h1>
          <p className="page-subtitle" style={{ margin: '0 0 14px' }}>{t('log.doc.deadlinesSub')}</p>

          {admin && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>{t('log.doc.emailAlerts')}</div>
              <div className="form-inline" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={alertCfg.actif} onChange={e => setAlertCfg(c => ({ ...c, actif: e.target.checked }))} />
                  {t('log.doc.enable')}
                </label>
                <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {t('log.doc.alertDaysBefore')}
                  <input type="number" min="1" value={alertCfg.jours} onChange={e => setAlertCfg(c => ({ ...c, jours: e.target.value }))} style={{ width: 90 }} />
                </label>
                <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--color-text-muted)', flex: 1, minWidth: 240 }}>
                  {t('log.doc.recipients')}
                  <input value={alertCfg.emails} onChange={e => setAlertCfg(c => ({ ...c, emails: e.target.value }))} placeholder="logistique@ccggroupe.com, …" />
                </label>
                <button className="btn btn-primary btn-sm" onClick={saveAlertCfg} style={{ alignSelf: 'flex-end' }}>{t('common.save')}</button>
                <button className="btn btn-secondary btn-sm" onClick={sendAlertNow} style={{ alignSelf: 'flex-end' }}>{t('log.doc.sendNow')}</button>
              </div>
              {alertMsg && <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8 }}>{alertMsg}</div>}
              <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: '8px 0 0' }}>{t('log.doc.autoCheckNote')}</p>
            </div>
          )}
          {echeances.length === 0 && <p className="empty-row">{t('log.doc.noDeadlines')}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {echeances.map(d => {
              const jr = Number(d.jours_restants);
              const st = echeanceStatus(jr, t);
              return (
                <div key={d.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{d.vehicle_immat}</strong> — {t('log.docType.' + d.type)}{d.numero ? ` (${d.numero})` : ''}
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3 }}>{t('log.doc.deadlineLabel')}{fmtDate(d.date_fin)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {d.lien && <a className="btn btn-secondary btn-sm" href={hrefOf(d.lien)} target="_blank" rel="noopener noreferrer">{t('log.open')}</a>}
                    <span className="badge" style={{ background: st.bg, color: st.fg, fontWeight: 700 }}>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
