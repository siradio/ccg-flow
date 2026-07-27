import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';

const OPTIONS = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'system', label: 'Système' },
];

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 20h8M12 17v3" />
    </svg>
  );
}

const ICONS = { light: SunIcon, dark: MoonIcon, system: SystemIcon };

export default function ThemeSwitcher() {
  const { mode, setMode } = useTheme();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const CurrentIcon = ICONS[mode];

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen(o => !o)}
        aria-label="Apparence"
        title="Apparence"
        type="button"
      >
        <CurrentIcon />
      </button>
      {open && (
        <div className="notif-dropdown theme-dropdown">
          <div className="notif-dropdown-header">Apparence</div>
          {OPTIONS.map(opt => {
            const Icon = ICONS[opt.value];
            return (
              <button
                key={opt.value}
                type="button"
                className={`theme-option${mode === opt.value ? ' theme-option-active' : ''}`}
                onClick={() => { setMode(opt.value); setOpen(false); }}
              >
                <Icon />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
