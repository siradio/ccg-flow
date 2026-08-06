import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

const OPTIONS = [
  { value: 'fr', key: 'lang.fr', code: 'FR' },
  { value: 'en', key: 'lang.en', code: 'EN' },
];

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const current = OPTIONS.find(o => o.value === lang) || OPTIONS[0];

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen(o => !o)}
        aria-label={t('lang.label')}
        title={t('lang.label')}
        type="button"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <GlobeIcon />
        <span style={{ fontSize: 12, fontWeight: 700 }}>{current.code}</span>
      </button>
      {open && (
        <div className="notif-dropdown theme-dropdown">
          <div className="notif-dropdown-header">{t('lang.label')}</div>
          {OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`theme-option${lang === opt.value ? ' theme-option-active' : ''}`}
              onClick={() => { setLang(opt.value); setOpen(false); }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, width: 22 }}>{opt.code}</span>
              <span>{t(opt.key)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
