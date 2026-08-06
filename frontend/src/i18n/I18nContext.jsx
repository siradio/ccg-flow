import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { translations } from './translations';

// i18n léger, sans dépendance : un contexte fournit `lang`, `setLang` et `t(clé, vars)`.
// Français par défaut et repli. Langue mémorisée par appareil (localStorage).
const STORAGE_KEY = 'ccg-flow-lang';
const DEFAULT_LANG = 'fr';
const SUPPORTED = ['fr', 'en'];

const I18nContext = createContext(null);

function initialLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(stored)) return stored;
  } catch { /* localStorage indisponible */ }
  return DEFAULT_LANG;
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  useEffect(() => { document.documentElement.setAttribute('lang', lang); }, [lang]);

  const setLang = useCallback((l) => {
    const v = SUPPORTED.includes(l) ? l : DEFAULT_LANG;
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
    setLangState(v);
  }, []);

  // Traduit une clé ; repli fr puis clé brute. `vars` remplace les {placeholders}.
  const t = useCallback((key, vars) => {
    let s = (translations[lang] && translations[lang][key]);
    if (s == null) s = (translations[DEFAULT_LANG][key] != null ? translations[DEFAULT_LANG][key] : key);
    if (vars) for (const k of Object.keys(vars)) s = String(s).replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
    return s;
  }, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // Repli défensif si un composant est monté hors provider : toujours du français.
  return { lang: DEFAULT_LANG, setLang: () => {}, t: (key) => (translations[DEFAULT_LANG][key] != null ? translations[DEFAULT_LANG][key] : key) };
}
