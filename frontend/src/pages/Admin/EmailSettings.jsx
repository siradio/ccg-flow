import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

// Configuration SMTP éditable par un super_admin, sans redéploiement (remplace la nécessité de
// modifier le .env sur le serveur). Le mot de passe n'est jamais renvoyé par l'API : le champ reste
// vide et n'est envoyé que si l'admin en saisit un nouveau (sinon l'existant est conservé).
export default function EmailSettings() {
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordSet, setPasswordSet] = useState(false);
  const [fromDb, setFromDb] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }

  useEffect(() => {
    client.get('/settings/smtp').then(res => {
      const d = res.data;
      setForm({ host: d.host || '', port: d.port || '587', user: d.user || '', from: d.from || '', secure: !!d.secure });
      setPasswordSet(!!d.passwordSet);
      setFromDb(!!d.fromDb);
      setTestTo(user?.email || '');
    }).catch(() => setError('Impossible de charger la configuration.'));
  }, [user]);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setSaved(false);
  }

  async function save() {
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      const payload = { ...form };
      // Le mot de passe n'est transmis que si l'admin en a saisi un : sinon on omet le champ pour
      // conserver l'existant côté serveur (undefined = inchangé).
      if (password !== '') payload.password = password;
      const res = await client.put('/settings/smtp', payload);
      setPasswordSet(!!res.data.passwordSet);
      setFromDb(!!res.data.fromDb);
      setPassword('');
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue à l’enregistrement.');
    } finally {
      setSaving(false);
    }
  }

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

  if (!form) return <p>Chargement…</p>;

  return (
    <div>
      <h1 className="page-title">Configuration email (SMTP)</h1>

      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 620, marginTop: 0 }}>
        Serveur d’envoi utilisé pour les emails de l’application (demandes de devis, notifications).
        Les valeurs saisies ici prennent le pas sur celles du fichier <code>.env</code> du serveur.
        {!fromDb && ' Actuellement, la configuration provient encore du .env — renseignez les champs ci-dessous pour la piloter depuis l’admin.'}
      </p>

      {error && <div className="alert alert-danger">{error}</div>}

      <section className="card" style={{ maxWidth: 520 }}>
        <div className="form-grid" style={{ maxWidth: '100%' }}>
          <label className="field">
            Serveur (hôte)
            <input type="text" value={form.host} onChange={e => update('host', e.target.value)} placeholder="ex. smtp-relay.brevo.com" />
          </label>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 120px' }}>
              Port
              <input type="number" value={form.port} onChange={e => update('port', e.target.value)} placeholder="587" />
            </label>
            <label className="field" style={{ flex: '1 1 200px', justifyContent: 'flex-end' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
                <input type="checkbox" checked={form.secure} onChange={e => update('secure', e.target.checked)} style={{ width: 'auto' }} />
                Connexion TLS implicite (port 465)
              </span>
            </label>
          </div>

          <label className="field">
            Utilisateur (login SMTP)
            <input type="text" value={form.user} onChange={e => update('user', e.target.value)} autoComplete="off" placeholder="laisser vide si le relais n’exige pas d’authentification" />
          </label>

          <label className="field">
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setSaved(false); }}
              autoComplete="new-password"
              placeholder={passwordSet ? '•••••••• (défini — laisser vide pour ne pas changer)' : 'non défini'}
            />
            <span style={{ fontSize: 12, color: 'var(--color-text-faint)', fontWeight: 400 }}>
              Stocké chiffré. Jamais réaffiché. Laissez vide pour conserver le mot de passe actuel.
            </span>
          </label>

          <label className="field">
            Expéditeur (From)
            <input type="text" value={form.from} onChange={e => update('from', e.target.value)} placeholder={'"CCG" <direction@ccggroupe.com>'} />
          </label>
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {saved && <span style={{ color: 'var(--color-success-fg)', fontSize: 13 }}>Enregistré.</span>}
        </div>
      </section>

      <section className="card" style={{ maxWidth: 520, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Tester la configuration</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>
          Envoie un vrai email de test avec la configuration <strong>enregistrée</strong>. Pensez à
          enregistrer vos modifications avant de tester.
        </p>
        <div className="form-inline">
          <input
            type="email"
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            placeholder="destinataire@exemple.com"
            style={{ flex: '1 1 240px' }}
          />
          <button className="btn btn-secondary btn-sm" onClick={sendTest} disabled={testing || !testTo}>
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
