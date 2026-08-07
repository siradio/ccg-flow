import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Écran Email (SMTP) en LECTURE SEULE : la configuration du serveur d'envoi est gérée via les
// variables d'environnement du serveur (App Settings Azure : SMTP_HOST, SMTP_PORT, SMTP_USER,
// SMTP_PASS, SMTP_FROM). On affiche ici la configuration effective + un bouton de test, sans champ
// éditable — pour éviter le piège d'une config qui semble saisie mais n'est en fait qu'héritée du
// serveur.
export default function EmailSettings() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState('');

  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }

  useEffect(() => {
    client.get('/settings/smtp').then(res => {
      setCfg(res.data);
      setTestTo(user?.email || '');
    }).catch(() => setError(t('adm.email.loadError')));
  }, [user, t]);

  async function sendTest() {
    setTestResult(null);
    setTesting(true);
    try {
      const res = await client.post('/settings/smtp/test', { to: testTo });
      setTestResult({ ok: true, message: t('adm.email.testSent', { to: res.data.to }) });
    } catch (err) {
      setTestResult({ ok: false, message: err.response?.data?.error || t('adm.email.testFailed') });
    } finally {
      setTesting(false);
    }
  }

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!cfg) return <p>{t('adm.common.loading')}</p>;

  const provider = cfg.provider || (cfg.host ? 'smtp' : 'none');
  const configured = provider !== 'none';
  const providerLabel = { graph: 'Microsoft Graph (OAuth2)', smtp: 'SMTP', none: t('adm.email.providerNone') }[provider];
  const rows = provider === 'graph'
    ? [
      [t('adm.email.row.channel'), 'Microsoft Graph (OAuth2, Mail.Send)'],
      [t('adm.email.row.sender'), cfg.graph?.sender || '—'],
    ]
    : [
      [t('adm.email.row.channel'), 'SMTP'],
      [t('adm.email.row.host'), cfg.host || '—'],
      [t('adm.email.row.port'), cfg.port || '—'],
      [t('adm.email.row.tls'), cfg.secure ? t('ref.yes') : t('ref.no')],
      [t('adm.email.row.user'), cfg.user || '—'],
      [t('adm.email.row.password'), cfg.passwordSet ? t('adm.email.set') : t('adm.email.notSet')],
      [t('adm.email.row.from'), cfg.from || '—'],
    ];

  return (
    <div>
      <h1 className="page-title">{t('adm.email.title')}</h1>

      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 660, marginTop: 0 }}>
        {t('adm.email.intro1')}<strong>{t('adm.email.introEnvVars')}</strong>{t('adm.email.intro2')}
        <strong>Microsoft Graph</strong> {t('adm.email.introGraphParen')}<code>GRAPH_TENANT_ID</code>,{' '}
        <code>GRAPH_CLIENT_ID</code>, <code>GRAPH_CLIENT_SECRET</code>, <code>GRAPH_SENDER</code>{t('adm.email.introElseSmtp')}
        <strong>SMTP</strong> (<code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,{' '}
        <code>SMTP_PASS</code>, <code>SMTP_FROM</code>{t('adm.email.introSmtpTail')}
      </p>

      <div style={{ fontSize: 13, marginBottom: 12 }}>
        {t('adm.email.activeChannel')} <strong>{providerLabel}</strong>
      </div>

      {!configured && (
        <div className="alert alert-warning" style={{ maxWidth: 660 }}>
          {t('adm.email.notConfiguredWarn')}
        </div>
      )}

      <section className="card" style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>{t('adm.email.effectiveConfig')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px', fontSize: 14 }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
              <span style={{ fontWeight: 600, wordBreak: 'break-word' }}>{value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ maxWidth: 520, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>{t('adm.email.testTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>
          {t('adm.email.testHelp')}
        </p>
        <div className="form-inline">
          <input
            type="email"
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            placeholder={t('adm.email.recipientPlaceholder')}
            style={{ flex: '1 1 240px' }}
          />
          <button className="btn btn-primary btn-sm" onClick={sendTest} disabled={testing || !testTo}>
            {testing ? t('adm.email.sending') : t('adm.email.sendTest')}
          </button>
        </div>
        {testResult && (
          <div className={`alert ${testResult.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: 12, marginBottom: 0 }}>
            {testResult.message}
          </div>
        )}
      </section>
    </div>
  );
}
