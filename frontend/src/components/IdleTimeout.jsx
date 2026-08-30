import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

// Déconnexion automatique après 5 minutes d'inactivité, avec un avertissement (compte à rebours)
// affiché 60 s avant. Pendant l'avertissement, seul le bouton « Rester connecté » réarme la session :
// l'activité souris/clavier ne l'annule pas en douce, pour que l'utilisateur voie qu'il a failli être
// déconnecté. Monté dans le shell authentifié (Layout) → actif uniquement une fois connecté.
const IDLE_MS = 5 * 60 * 1000; // durée totale d'inactivité avant déconnexion
const WARN_MS = 60 * 1000;     // l'avertissement apparaît 60 s avant la fin

export default function IdleTimeout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [remaining, setRemaining] = useState(null); // secondes restantes ; null = pas d'avertissement
  const lastActivity = useRef(Date.now());
  const warning = useRef(false);

  const stay = useCallback(() => { lastActivity.current = Date.now(); warning.current = false; setRemaining(null); }, []);

  useEffect(() => {
    if (!user) return;
    lastActivity.current = Date.now(); warning.current = false; setRemaining(null);

    // Toute activité réarme le minuteur — sauf pendant l'avertissement (acquittement explicite requis).
    const onActivity = () => { if (!warning.current) lastActivity.current = Date.now(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    const iv = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_MS) { warning.current = false; logout(); return; }
      if (idle >= IDLE_MS - WARN_MS) { warning.current = true; setRemaining(Math.ceil((IDLE_MS - idle) / 1000)); }
    }, 1000);

    return () => { clearInterval(iv); events.forEach(e => window.removeEventListener(e, onActivity)); };
  }, [user, logout]);

  if (!user || remaining == null) return null;

  return (
    <div role="alertdialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>{t('session.title')}</h2>
        <p style={{ color: 'var(--color-text-muted)', margin: '8px 0 4px' }}>{t('session.body')}</p>
        <div style={{ fontSize: 40, fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '6px 0 14px', color: 'var(--color-primary, #1F4E79)' }}>
          {remaining}s
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={stay}>{t('session.stay')}</button>
          <button className="btn btn-secondary" onClick={logout}>{t('session.logoutNow')}</button>
        </div>
      </div>
    </div>
  );
}
