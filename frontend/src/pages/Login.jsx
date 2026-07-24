import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import logo from '../assets/logo-web-darklogo.png';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="login-page">
      <svg className="login-page-art" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M-100,560 C250,460 350,660 650,540 C950,420 1000,600 1300,500" />
        <path d="M-100,650 C250,560 400,720 700,620 C1000,520 1050,680 1300,600" />
        <path d="M-100,460 C300,380 380,540 680,440 C980,340 1020,480 1300,400" />
        <circle cx="1080" cy="160" r="220" />
        <circle cx="120" cy="120" r="140" />
        <text x="850" y="740" textAnchor="middle" className="login-watermark" transform="rotate(-8 850 740)">CCG</text>
        <text x="350" y="190" textAnchor="middle" className="login-watermark login-watermark-sm" transform="rotate(-8 350 190)">Best</text>
      </svg>
      <div className="card login-card" style={{ width: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <span className="brand-mark brand-mark-logo"><img src={logo} alt="CCG" /></span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>CCG Flow</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Connexion</div>
          </div>
        </div>
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
      </div>
    </div>
  );
}
