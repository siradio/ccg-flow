import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav, { firstCommerceTarget } from './CommerceSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Paramètres Commerce — workflow de validation OPTIONNEL (global + surcharge par BU).
// Désactivé par défaut : la saisie d'un versement vaut enregistrement immédiat (reprise Excel).
// Les règles avancées (seuils, obligation par moyen…) seront ajoutées en Phase F.
const KEY = 'workflow_actif';

export default function CommerceParametres() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [settings, setSettings] = useState([]);
  const [bus, setBus] = useState([]);
  const [msg, setMsg] = useState('');
  const canEdit = hasSubModuleLevel(user, 'commerce.parametres', 'edition');

  function load() {
    client.get('/commerce/settings').then(r => setSettings(r.data)).catch(() => {});
  }
  useEffect(() => {
    load();
    client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {});
  }, []);

  if (!hasSubModuleLevel(user, 'commerce.parametres')) {
    const target = firstCommerceTarget(user);
    return target ? <Navigate to={target} replace /> : <p style={{ padding: 16 }}>{t('com.access.denied')}</p>;
  }

  // Valeur effective : override BU si présent, sinon valeur globale.
  const globalVal = settings.find(s => s.business_unit_id === null && s.cle === KEY)?.valeur === 'true';
  const buVal = (buId) => {
    const row = settings.find(s => s.business_unit_id === buId && s.cle === KEY);
    return row ? row.valeur === 'true' : null; // null = hérite du global
  };

  async function save(buId, valeur) {
    setMsg('');
    await client.put('/commerce/settings', { business_unit_id: buId, cle: KEY, valeur: String(valeur) });
    setMsg(t('com.param.saved'));
    load();
  }

  return (
    <div>
      <CommerceSubnav />
      <h1 className="page-title">{t('com.param.title')}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 680, marginTop: 0 }}>
        {t('com.param.introLead')}<strong>{t('com.param.introStrong')}</strong>{t('com.param.introRest')}
      </p>
      {msg && <div className="alert alert-success" style={{ maxWidth: 680 }}>{msg}</div>}

      <section className="card" style={{ maxWidth: 680 }}>
        <h2 style={{ marginTop: 0 }}>{t('com.param.workflowTitle')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
          <div><strong>{t('com.param.globalDefault')}</strong><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('com.param.globalDesc')}</div></div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={globalVal} disabled={!canEdit} onChange={e => save(null, e.target.checked)} />
            {globalVal ? t('com.param.enabled') : t('com.param.disabled')}
          </label>
        </div>
        {bus.map(bu => {
          const v = buVal(bu.id);
          return (
            <div key={bu.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div>{bu.nom} <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>({bu.code})</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {v === null ? t('com.param.inherit', { v: globalVal ? t('com.param.enabledLc') : t('com.param.disabledLc') }) : (v ? t('com.param.enabledLc') : t('com.param.disabledLc'))}
                </span>
                <select value={v === null ? '' : String(v)} disabled={!canEdit}
                  onChange={e => save(bu.id, e.target.value === 'true')}>
                  <option value="">{t('com.param.inheritGlobal')}</option>
                  <option value="true">{t('com.param.enabled')}</option>
                  <option value="false">{t('com.param.disabled')}</option>
                </select>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
