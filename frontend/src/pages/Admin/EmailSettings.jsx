import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

// Écran Email (SMTP) en LECTURE SEULE : la configuration du serveur d'envoi est gérée via les
// variables d'environnement du serveur (App Settings Azure : SMTP_HOST, SMTP_PORT, SMTP_USER,
// SMTP_PASS, SMTP_FROM). On affiche ici la configuration effective + un bouton de test, sans champ
// éditable — pour éviter le piège d'une config qui semble saisie mais n'est en fait qu'héritée du
// serveur.
export default function EmailSettings() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState('');

  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }

  useEffect(() => {
    client.get('/settings/smtp').then(res => {
      setCfg(res.data);
      setTestTo(user?.email || '');
    }).catch(() => setError('Impossible de charger la configuration.'));
  }, [user]);

  async function sendTest() {
    setTestResult(null);
    setTesting(true);
    try {
      const res = await client.post('/settings/smtp/test', { to: testTo });
      setTestResult({ ok: true, message: `Email de test envoyé à ${res.data.to}. Vérifiez la boîte de réception (et les spams).` });
    } catch (err) {
      setTestResult({ ok: false, message: err.response?.data?.error || 'Échec de l’envoi du test.' });
    } finally {
      setTesting(false);
    }
  }

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!cfg) return <p>Chargement…</p>;

  const configured = !!cfg.host;
  const rows = [
    ['Serveur (hôte)', cfg.host || '—'],
    ['Port', cfg.port || '—'],
    ['TLS implicite (465)', cfg.secure ? 'Oui' : 'Non'],
    ['Utilisateur (login SMTP)', cfg.user || '—'],
    ['Mot de passe', cfg.passwordSet ? 'Défini' : 'Non défini'],
    ['Expéditeur (From)', cfg.from || '—'],
  ];

  return (
    <div>
      <h1 className="page-title">Configuration email (SMTP)</h1>

      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 640, marginTop: 0 }}>
        Serveur d’envoi utilisé pour les emails de l’application (demandes de devis, notifications, accès
        utilisateurs). La configuration est gérée via les <strong>variables d’environnement du serveur</strong>{' '}
        (App Settings Azure : <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,{' '}
        <code>SMTP_PASS</code>, <code>SMTP_FROM</code>). Cet écran est en lecture seule ; utilisez le test
        ci-dessous pour vérifier l’envoi.
      </p>

      {!configured && (
        <div className="alert alert-warning" style={{ maxWidth: 640 }}>
          Aucun serveur SMTP n’est configuré : les emails ne partiront pas tant que les variables
          d’environnement ne sont pas renseignées côté serveur.
        </div>
      )}

      <section className="card" style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>Configuration effective</h2>
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
        <h2 style={{ marginTop: 0 }}>Tester la configuration</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>
          Envoie un vrai email de test avec la configuration effective ci-dessus.
        </p>
        <div className="form-inline">
          <input
            type="email"
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            placeholder="destinataire@exemple.com"
            style={{ flex: '1 1 240px' }}
          />
          <button className="btn btn-primary btn-sm" onClick={sendTest} disabled={testing || !testTo}>
            {testing ? 'Envoi…' : 'Envoyer un email de test'}
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
