import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import client from '../api/client';
import logo from '../assets/logo-web-darklogo.png';

const EMPTY_REQUEST = { nom: '', prenom: '', email: '', telephone: '', fonction: '', entityId: '' };

// L'acrostiche RÉUSSIR — les valeurs du groupe CCG, dans les couleurs de la charte "Nos valeurs".
const REUSSIR = [
  { letter: 'R', color: '#3FA34D', label: 'Respect' },
  { letter: 'É', color: '#2563EB', label: 'Engagement' },
  { letter: 'U', color: '#F39C12', label: 'Union' },
  { letter: 'S', color: '#17A2A0', label: 'Satisfaction client' },
  { letter: 'S', color: '#8E44AD', label: 'Standard de qualité' },
  { letter: 'I', color: '#F5B301', label: 'Innovation & Intégrité' },
  { letter: 'R', color: '#E4442F', label: 'Résilience & Rigueur' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'request'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Demande d'accès
  const [entities, setEntities] = useState([]);
  const [req, setReq] = useState(EMPTY_REQUEST);
  const [reqError, setReqError] = useState('');
  const [reqLoading, setReqLoading] = useState(false);
  const [reqDone, setReqDone] = useState(false);

  useEffect(() => {
    if (mode === 'request' && entities.length === 0) {
      client.get('/access-requests/entities').then(res => setEntities(res.data)).catch(() => {});
    }
  }, [mode, entities.length]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur de connexion.');
    } finally {
      setLoading(false);
    }
  }

  async function submitRequest(e) {
    e.preventDefault();
    setReqError('');
    setReqLoading(true);
    try {
      await client.post('/access-requests', { ...req, entityId: Number(req.entityId) });
      setReqDone(true);
    } catch (err) {
      setReqError(err.response?.data?.error || 'Une erreur est survenue.');
    } finally {
      setReqLoading(false);
    }
  }

  function updateReq(field, value) { setReq(r => ({ ...r, [field]: value })); }

  return (
    <div className="login-page">
      <svg className="login-page-art" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M-100,560 C250,460 350,660 650,540 C950,420 1000,600 1300,500" />
        <path d="M-100,650 C250,560 400,720 700,620 C1000,520 1050,680 1300,600" />
        <path d="M-100,460 C300,380 380,540 680,440 C980,340 1020,480 1300,400" />
        <circle cx="1080" cy="160" r="220" />
        <circle cx="120" cy="120" r="140" />
        <text x="850" y="740" textAnchor="middle" className="login-watermark" transform="rotate(-8 850 740)">CCG</text>
      </svg>
      <div className="login-shell">
        <div className="login-brand">
          <div className="login-brand-eyebrow">NOS VALEURS</div>
          <div className="reussir-word" aria-label="RÉUSSIR">
            {REUSSIR.map((v, i) => <span key={i} style={{ color: v.color }}>{v.letter}</span>)}
          </div>
          <ul className="reussir-list">
            {REUSSIR.map((v, i) => (
              <li key={i}>
                <span className="reussir-badge" style={{ background: v.color }}>{v.letter}</span>
                {v.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="card login-card" style={{ width: '100%', maxWidth: mode === 'request' ? 420 : 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <span className="brand-mark brand-mark-logo"><img src={logo} alt="CCG" /></span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>CCG Flow</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {mode === 'login' ? 'Connexion' : 'Demande d’accès'}
            </div>
          </div>
        </div>

        {mode === 'login' && (
          <>
            <form onSubmit={onSubmit} className="form-grid" style={{ maxWidth: 'none' }}>
              <label className="field">
                Email
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </label>
              <label className="field">
                Mot de passe
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </label>
              {error && <div className="alert alert-danger">{error}</div>}
              <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: 'center' }}>
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--color-text-muted)' }}>
              Pas encore de compte ?{' '}
              <button type="button" className="link-button" onClick={() => { setMode('request'); setError(''); }}>
                Demander un accès
              </button>
            </div>
          </>
        )}

        {mode === 'request' && (
          reqDone ? (
            <div>
              <div className="alert alert-success" style={{ marginTop: 0 }}>
                Votre demande a bien été envoyée. Un administrateur la traitera, et vous recevrez vos identifiants
                par email une fois votre accès validé.
              </div>
              <button type="button" className="btn btn-secondary" style={{ justifyContent: 'center', width: '100%' }}
                onClick={() => { setMode('login'); setReq(EMPTY_REQUEST); setReqDone(false); }}>
                Retour à la connexion
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>
                Renseignez vos informations : un administrateur validera votre accès et vous recevrez vos identifiants par email.
              </p>
              <form onSubmit={submitRequest} className="form-grid" style={{ maxWidth: 'none' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label className="field" style={{ flex: 1, minWidth: 0 }}>
                    Prénom
                    <input value={req.prenom} onChange={e => updateReq('prenom', e.target.value)} required />
                  </label>
                  <label className="field" style={{ flex: 1, minWidth: 0 }}>
                    Nom
                    <input value={req.nom} onChange={e => updateReq('nom', e.target.value)} required />
                  </label>
                </div>
                <label className="field">
                  Email professionnel
                  <input type="email" value={req.email} onChange={e => updateReq('email', e.target.value)} required />
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label className="field" style={{ flex: 1, minWidth: 0 }}>
                    Téléphone
                    <input value={req.telephone} onChange={e => updateReq('telephone', e.target.value)} />
                  </label>
                  <label className="field" style={{ flex: 1, minWidth: 0 }}>
                    Entité
                    <select value={req.entityId} onChange={e => updateReq('entityId', e.target.value)} required>
                      <option value="" disabled>—</option>
                      {entities.map(en => <option key={en.id} value={en.id}>{en.code}</option>)}
                    </select>
                  </label>
                </div>
                <label className="field">
                  Fonction
                  <input value={req.fonction} onChange={e => updateReq('fonction', e.target.value)} placeholder="ex. Comptable, Responsable achats…" />
                </label>
                {reqError && <div className="alert alert-danger">{reqError}</div>}
                <button type="submit" disabled={reqLoading} className="btn btn-primary" style={{ justifyContent: 'center' }}>
                  {reqLoading ? 'Envoi…' : 'Envoyer la demande'}
                </button>
              </form>
              <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
                <button type="button" className="link-button" onClick={() => { setMode('login'); setReqError(''); }}>
                  ← Retour à la connexion
                </button>
              </div>
            </>
          )
        )}
        </div>
        <p className="login-brand-tagline">
          Ensemble, nous bâtissons un avenir <strong>durable</strong>, <strong>performant</strong> et centré sur le <strong>client</strong>.
        </p>
      </div>
    </div>
  );
}
