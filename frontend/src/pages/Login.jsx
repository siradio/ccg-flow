import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import client from '../api/client';
import logo from '../assets/logo-web-darklogo.png';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useI18n } from '../i18n/I18nContext';

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
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'request'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Demande d'accès
  const [entities, setEntities] = useState([]);
  const [req, setReq] = useState(EMPTY_REQUEST);
  const [reqError, setReqError] = useState('');
  const [reqLoading, setReqLoading] = useState(false);
  const [reqDone, setReqDone] = useState(false);

  // Habillage événementiel de la page (configuré par le super_admin). null = fond par défaut.
  const [bg, setBg] = useState(null);

  useEffect(() => {
    client.get('/public/login-background').then(res => setBg(res.data.active)).catch(() => {});
  }, []);

  useEffect(() => {
    if (mode === 'request' && entities.length === 0) {
      client.get('/access-requests/entities').then(res => setEntities(res.data)).catch(() => {});
    }
  }, [mode, entities.length]);

  const hasCustomBg = !!(bg && bg.has_image);
  const bgImageUrl = hasCustomBg ? `${client.defaults.baseURL}/public/login-background/image?v=${bg.id}` : null;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || t('login.error'));
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
      setReqError(err.response?.data?.error || t('login.genericError'));
    } finally {
      setReqLoading(false);
    }
  }

  function updateReq(field, value) { setReq(r => ({ ...r, [field]: value })); }

  return (
    <div className={`login-page${hasCustomBg ? ' login-page--custom-bg' : ''}`}>
      {/* Habillage événementiel (super_admin) : image d'arrière-plan + voile de lisibilité. */}
      {hasCustomBg && (
        <>
          <div className="login-page-image" style={{ backgroundImage: `url("${bgImageUrl}")` }} aria-hidden="true" />
          <div className="login-page-scrim" aria-hidden="true" />
        </>
      )}
      {/* Arrière-plan par défaut « CCG Flow » : un réseau de nœuds reliés, illustrant la connexion / le lien. */}
      {!hasCustomBg && (
      <svg className="login-page-art" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {/* halos d'ambiance */}
        <circle cx="1080" cy="160" r="240" />
        <circle cx="120" cy="120" r="150" />
        {/* liens entre les nœuds */}
        <g>
          <line className="net-line" x1="120" y1="120" x2="300" y2="240" />
          <line className="net-line" x1="300" y1="240" x2="90" y2="360" />
          <line className="net-line" x1="90" y1="360" x2="240" y2="520" />
          <line className="net-line" x1="240" y1="520" x2="140" y2="680" />
          <line className="net-line" x1="140" y1="680" x2="420" y2="700" />
          <line className="net-line" x1="120" y1="120" x2="90" y2="360" />
          <line className="net-line" x1="120" y1="120" x2="600" y2="120" />
          <line className="net-line" x1="300" y1="240" x2="600" y2="120" />
          <line className="net-line" x1="240" y1="520" x2="420" y2="700" />
          <line className="net-line" x1="600" y1="120" x2="1080" y2="160" />
          <line className="net-line" x1="600" y1="120" x2="900" y2="280" />
          <line className="net-line" x1="1080" y1="160" x2="900" y2="280" />
          <line className="net-line" x1="1080" y1="160" x2="1120" y2="380" />
          <line className="net-line" x1="900" y1="280" x2="1120" y2="380" />
          <line className="net-line" x1="1120" y1="380" x2="960" y2="560" />
          <line className="net-line" x1="960" y1="560" x2="1100" y2="660" />
          <line className="net-line" x1="1100" y1="660" x2="780" y2="700" />
          <line className="net-line" x1="960" y1="560" x2="780" y2="700" />
          <line className="net-line" x1="900" y1="280" x2="960" y2="560" />
          <line className="net-line" x1="780" y1="700" x2="600" y2="760" />
          <line className="net-line" x1="600" y1="760" x2="420" y2="700" />
        </g>
        {/* halos des nœuds principaux */}
        <circle className="net-glow" cx="120" cy="120" r="30" />
        <circle className="net-glow" cx="600" cy="120" r="30" style={{ animationDelay: '1.5s' }} />
        <circle className="net-glow" cx="1080" cy="160" r="30" style={{ animationDelay: '2.8s' }} />
        {/* nœuds */}
        <circle className="net-node net-node--hub" cx="120" cy="120" r="8" />
        <circle className="net-node net-node--hub" cx="600" cy="120" r="8" />
        <circle className="net-node net-node--hub" cx="1080" cy="160" r="8" />
        <circle className="net-node" cx="300" cy="240" r="5" />
        <circle className="net-node" cx="90" cy="360" r="5" />
        <circle className="net-node" cx="240" cy="520" r="5" />
        <circle className="net-node" cx="140" cy="680" r="5" />
        <circle className="net-node" cx="420" cy="700" r="5" />
        <circle className="net-node" cx="900" cy="280" r="5" />
        <circle className="net-node" cx="1120" cy="380" r="5" />
        <circle className="net-node" cx="960" cy="560" r="5" />
        <circle className="net-node" cx="1100" cy="660" r="5" />
        <circle className="net-node" cx="780" cy="700" r="5" />
        <circle className="net-node" cx="600" cy="760" r="5" />
        <text x="860" y="745" textAnchor="middle" className="login-watermark login-watermark-sm" transform="rotate(-8 860 745)">CCG</text>
      </svg>
      )}
      <div style={{ position: 'absolute', top: 14, right: 16, zIndex: 5 }}><LanguageSwitcher /></div>
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
        {bg?.message && <div className="login-event" role="status">{bg.message}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <span className="brand-mark brand-mark-logo"><img src={logo} alt="CCG" /></span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>CCG Flow</div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>{t('login.subtitle')}</div>
            <div style={{ fontSize: 11.5, color: 'var(--color-primary)', fontWeight: 600, marginTop: 1 }}>
              {mode === 'login' ? t('login.mode.login') : t('login.mode.request')}
            </div>
          </div>
        </div>

        {mode === 'login' && (
          <>
            <form onSubmit={onSubmit} className="form-grid" style={{ maxWidth: 'none' }}>
              <label className="field">
                {t('login.email')}
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </label>
              <label className="field">
                {t('login.password')}
                <span style={{ position: 'relative', display: 'block' }}>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                    style={{ width: '100%', paddingRight: 42 }} />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--color-text-muted, #6b7280)', display: 'inline-flex' }}>
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </span>
              </label>
              {error && <div className="alert alert-danger">{error}</div>}
              <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: 'center' }}>
                {loading ? t('login.signingIn') : t('login.signIn')}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--color-text-muted)' }}>
              {t('login.noAccount')}{' '}
              <button type="button" className="link-button" onClick={() => { setMode('request'); setError(''); }}>
                {t('login.requestAccess')}
              </button>
            </div>
          </>
        )}

        {mode === 'request' && (
          reqDone ? (
            <div>
              <div className="alert alert-success" style={{ marginTop: 0 }}>
                {t('login.requestSent')}
              </div>
              <button type="button" className="btn btn-secondary" style={{ justifyContent: 'center', width: '100%' }}
                onClick={() => { setMode('login'); setReq(EMPTY_REQUEST); setReqDone(false); }}>
                {t('login.backToLogin')}
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0 }}>
                {t('login.requestIntro')}
              </p>
              <form onSubmit={submitRequest} className="form-grid" style={{ maxWidth: 'none' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label className="field" style={{ flex: 1, minWidth: 0 }}>
                    {t('login.firstName')}
                    <input value={req.prenom} onChange={e => updateReq('prenom', e.target.value)} required />
                  </label>
                  <label className="field" style={{ flex: 1, minWidth: 0 }}>
                    {t('login.lastName')}
                    <input value={req.nom} onChange={e => updateReq('nom', e.target.value)} required />
                  </label>
                </div>
                <label className="field">
                  {t('login.workEmail')}
                  <input type="email" value={req.email} onChange={e => updateReq('email', e.target.value)} required />
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label className="field" style={{ flex: 1, minWidth: 0 }}>
                    {t('login.phone')}
                    <input value={req.telephone} onChange={e => updateReq('telephone', e.target.value)} />
                  </label>
                  <label className="field" style={{ flex: 1, minWidth: 0 }}>
                    {t('login.entity')}
                    <select value={req.entityId} onChange={e => updateReq('entityId', e.target.value)} required>
                      <option value="" disabled>—</option>
                      {entities.map(en => <option key={en.id} value={en.id}>{en.code}</option>)}
                    </select>
                  </label>
                </div>
                <label className="field">
                  {t('login.role')}
                  <input value={req.fonction} onChange={e => updateReq('fonction', e.target.value)} placeholder={t('login.rolePlaceholder')} />
                </label>
                {reqError && <div className="alert alert-danger">{reqError}</div>}
                <button type="submit" disabled={reqLoading} className="btn btn-primary" style={{ justifyContent: 'center' }}>
                  {reqLoading ? t('login.sending') : t('login.sendRequest')}
                </button>
              </form>
              <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
                <button type="button" className="link-button" onClick={() => { setMode('login'); setReqError(''); }}>
                  {t('login.backToLoginArrow')}
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
