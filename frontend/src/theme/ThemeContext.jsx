import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'ccg-flow-theme';
const MODES = ['light', 'dark', 'system'];
const ThemeContext = createContext(null);

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(mode) {
  const effective = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
  document.documentElement.setAttribute('data-theme', effective);
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(stored) ? stored : 'system';
  });

  useEffect(() => {
    applyTheme(mode);
    if (mode !== 'system') return;
    // En mode "système", on suit les changements de préférence OS en direct (pas besoin de recharger la page).
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  function setMode(next) {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme doit être utilisé à l’intérieur de ThemeProvider');
  return ctx;
}
