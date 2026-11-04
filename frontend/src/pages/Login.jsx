import { useEffect, useRef, useState } from 'react';
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
  // Bandeau d'informations défilant (configuré par le super_admin). { enabled, messages[], speed }.
  const [ticker, setTicker] = useState(null);
  const netRef = useRef(null);

  // Message éventuel de fin de session (ex. compte utilisé sur un autre appareil), posé par le
  // client HTTP avant redirection ici. Lu une seule fois puis effacé.
  const [notice, setNotice] = useState('');
  useEffect(() => {
    try {
      const n = localStorage.getItem('session_notice');
      if (n) { setNotice(n); localStorage.removeItem('session_notice'); }
    } catch { /* stockage indispo */ }
  }, []);

  useEffect(() => {
    client.get('/public/login-background').then(res => setBg(res.data.active)).catch(() => {});
    client.get('/public/login-ticker').then(res => setTicker(res.data)).catch(() => {});
  }, []);

  // Fond animé « CCG Flow » : réseau de nœuds vivant où circulent des paquets de données (clin
  // d'œil à « Flow »). Désactivé si un habillage image est actif. Respecte « animations réduites ».
  useEffect(() => {
    const custom = !!(bg && bg.has_image);
    const canvas = netRef.current;
    if (custom || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const PK = ['#3fa34d', '#2563eb', '#f39c12', '#17a2a0', '#8e44ad', '#f5b301', '#e4442f'];
    let W = 0, H = 0, raf = 0, nodes = [], edges = [], packets = [], last = 0, acc = 0, rt = 0;

    function build() {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const count = Math.max(14, Math.min(30, Math.round((W * H) / 42000)));
      nodes = [];
      for (let i = 0; i < count; i++) {
        const hub = i % 6 === 0;
        nodes.push({ x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * (reduced ? 0 : 0.22), vy: (Math.random() - 0.5) * (reduced ? 0 : 0.22),
          r: hub ? 4 : 2.3, hub, phase: Math.random() * Math.PI * 2 });
      }
      edges = [];
      const THR = Math.min(W, H) * 0.33;
      for (let a = 0; a < nodes.length; a++) {
        const near = [];
        for (let b = 0; b < nodes.length; b++) {
          if (a === b) continue;
          const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
          if (d < THR) near.push({ b, d });
        }
        near.sort((p, q) => p.d - q.d);
        near.slice(0, nodes[a].hub ? 4 : 2).forEach(e => { if (a < e.b) edges.push({ a, b: e.b }); });
      }
    }
    function spawn() {
      if (!edges.length) return;
      const e = edges[(Math.random() * edges.length) | 0];
      const dir = Math.random() < 0.5;
      packets.push({ a: dir ? e.a : e.b, b: dir ? e.b : e.a, t: 0, speed: 0.004 + Math.random() * 0.006, color: PK[(Math.random() * PK.length) | 0] });
    }
    function frame(ts) {
      const dt = Math.min(40, ts - last); last = ts;
      ctx.clearRect(0, 0, W, H);
      for (const n of nodes) { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > W) n.vx *= -1; if (n.y < 0 || n.y > H) n.vy *= -1; n.phase += 0.015; }
      const THR = Math.min(W, H) * 0.33;
      ctx.lineWidth = 1;
      for (const e of edges) {
        const A = nodes[e.a], B = nodes[e.b];
        const d = Math.hypot(A.x - B.x, A.y - B.y);
        if (d > THR) continue;
        ctx.strokeStyle = 'rgba(150,180,255,' + (0.18 * (1 - d / THR)).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
      if (!reduced) {
        acc += dt;
        if (acc > 420) { acc = 0; if (packets.length < Math.min(26, edges.length)) spawn(); }
        for (let p = packets.length - 1; p >= 0; p--) {
          const pk = packets[p]; pk.t += pk.speed * (dt / 16.7);
          if (pk.t >= 1) { packets.splice(p, 1); continue; }
          const A = nodes[pk.a], B = nodes[pk.b];
          const x = A.x + (B.x - A.x) * pk.t, y = A.y + (B.y - A.y) * pk.t;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 7);
          g.addColorStop(0, pk.color); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.283); ctx.fill();
          ctx.fillStyle = pk.color; ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.283); ctx.fill();
        }
      }
      for (const m of nodes) {
        const pr = m.r + (m.hub ? Math.sin(m.phase) * 1.1 : 0);
        if (m.hub) {
          const gg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, pr * 5);
          gg.addColorStop(0, 'rgba(59,106,219,0.28)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(m.x, m.y, pr * 5, 0, 6.283); ctx.fill();
        }
        ctx.fillStyle = m.hub ? 'rgba(190,210,255,0.95)' : 'rgba(170,200,255,0.8)';
        ctx.beginPath(); ctx.arc(m.x, m.y, pr, 0, 6.283); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    build();
    if (reduced) { frame(0); cancelAnimationFrame(raf); }
    else { last = performance.now(); raf = requestAnimationFrame(frame); }
    const onResize = () => { clearTimeout(rt); rt = setTimeout(build, 180); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); clearTimeout(rt); window.removeEventListener('resize', onResize); };
  }, [bg]);

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

  const showTicker = !!(ticker && ticker.enabled && ticker.messages && ticker.messages.length > 0);

  return (
    <div className={`login-page${hasCustomBg ? ' login-page--custom-bg' : ''}${showTicker ? ' login-page--ticker' : ''}`}>
      {/* Habillage événementiel (super_admin) : image d'arrière-plan + voile de lisibilité. */}
      {hasCustomBg && (
        <>
          <div className="login-page-image" style={{ backgroundImage: `url("${bgImageUrl}")` }} aria-hidden="true" />
          <div className="login-page-scrim" aria-hidden="true" />
        </>
      )}
      {/* Arrière-plan par défaut « CCG Flow » : réseau de nœuds vivant (canvas animé) + halos d'aurore. */}
      {!hasCustomBg && (
        <>
          <canvas ref={netRef} className="login-net" aria-hidden="true" />
          <div className="login-aurora" aria-hidden="true"><span /><span /><span /></div>
        </>
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
            {notice && <div className="alert alert-warning" style={{ marginBottom: 12 }}>{notice}</div>}
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

      {/* Bandeau d'informations défilant (configuré par le super_admin). Masqué si désactivé/vide. */}
      {ticker && ticker.enabled && ticker.messages && ticker.messages.length > 0 && (
        <aside className={`login-ticker login-ticker--${ticker.speed || 'normal'}`} aria-label="Informations">
          <span className="login-ticker-tag" aria-hidden="true">📣 INFOS</span>
          <div className="login-ticker-view">
            <div className="login-ticker-track">
              {[0, 1].map(dup => (
                <span className="login-ticker-seq" key={dup} aria-hidden={dup === 1 ? 'true' : undefined}>
                  {ticker.messages.map((m, i) => (
                    <span className="login-ticker-item" key={`${dup}_${i}`}>{m}<span className="login-ticker-sep">◆</span></span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
