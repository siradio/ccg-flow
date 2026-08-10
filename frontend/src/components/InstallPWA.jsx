import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

// Bouton d'installation de la PWA dans la topbar. Rend l'installation DÉCOUVRABLE :
// - si le navigateur propose l'invite native (Chrome/Edge/Android), un clic la déclenche ;
// - sinon (iOS/Safari, ou invite pas encore prête), un clic affiche la marche à suivre.
// Masqué une fois l'app installée (mode standalone).
function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export default function InstallPWA() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showHelp, setShowHelp] = useState(false);
  const wrapRef = useRef(null);
  const platform = detectPlatform();
  const { t } = useI18n();

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setShowHelp(false); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Ferme le popover d'aide au clic extérieur.
  useEffect(() => {
    if (!showHelp) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowHelp(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showHelp]);

  if (installed) return null;

  async function onClick() {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* ignore */ }
      setDeferred(null);
      return;
    }
    setShowHelp((s) => !s);
  }

  const steps = {
    ios: ['Ouvrez ce site dans Safari.', 'Touchez le bouton Partager (carré avec une flèche).', '« Sur l’écran d’accueil », puis Ajouter.'],
    android: ['Ouvrez le menu ⋮ de Chrome (en haut à droite).', '« Installer l’application » (ou « Ajouter à l’écran d’accueil »).', 'Confirmez.'],
    desktop: ['Dans la barre d’adresse, cliquez l’icône d’installation (écran avec une flèche).', 'Ou menu ⋮ → « Installer CCG Flow ».', 'Confirmez « Installer ».'],
  }[platform];

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={onClick}
        className="btn btn-secondary btn-sm"
        title={t('install.title')}
      >
        <span aria-hidden="true">📲</span> <span className="btn-label">{t('install.button')}</span>
      </button>
      {showHelp && (
        <div
          role="dialog"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60, width: 300,
            background: 'var(--color-surface, #fff)', color: 'var(--color-text, #111)',
            border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 12,
            boxShadow: '0 16px 40px -12px rgba(0,0,0,0.35)', padding: '14px 16px', textAlign: 'left',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Installer CCG Flow</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
            {steps.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
          </ol>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted, #6b7280)', marginTop: 8 }}>
            L'app s'ouvre ensuite en plein écran, comme une application native.
          </div>
        </div>
      )}
    </span>
  );
}
