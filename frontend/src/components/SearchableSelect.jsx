import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext';

// Sélecteur recherchable (combobox) : un champ texte qui filtre une liste au fur et à mesure de la
// frappe, puis on choisit une option. Pratique pour les longues listes (employés, comptes…) où un
// <select> natif est impraticable. Sans dépendance externe, cohérent avec le reste de l'appli.
// - value : id sélectionné (ou '' / null)
// - onChange(id|null) : appelé à la sélection / effacement
// - options : tableau d'objets possédant un `id`
// - getLabel(o) : libellé affiché ; getSearch(o) : texte sur lequel porte la recherche
export default function SearchableSelect({
  value, onChange, options = [], getLabel, getSearch,
  placeholder = '', noneLabel = '—', disabled = false,
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef(null);

  const selected = options.find(o => String(o.id) === String(value)) || null;
  // Hors saisie : on affiche le libellé sélectionné ; en saisie : ce que l'utilisateur tape.
  const display = open ? query : (selected ? getLabel(selected) : '');

  const q = query.trim().toLowerCase();
  const filtered = !open ? []
    : (q === '' ? options : options.filter(o => getSearch(o).toLowerCase().includes(q))).slice(0, 50);

  useEffect(() => {
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function choose(o) { onChange(o ? o.id : null); setOpen(false); setQuery(''); }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => { setOpen(true); setQuery(''); setHi(0); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && open && filtered[hi]) { e.preventDefault(); choose(filtered[hi]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        style={{ width: '100%', minWidth: 260, paddingRight: value ? 24 : undefined }}
      />
      {value && !disabled && (
        <button type="button" onClick={() => choose(null)} aria-label={t('common.clear')}
          style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--color-text-muted)' }}>×</button>
      )}
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, top: 'calc(100% + 2px)', left: 0, right: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
          <div onMouseDown={e => e.preventDefault()} onClick={() => choose(null)}
            style={{ padding: '6px 10px', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 13 }}>{noneLabel}</div>
          {filtered.map((o, i) => (
            <div key={o.id} onMouseDown={e => e.preventDefault()} onClick={() => choose(o)}
              style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, background: i === hi ? 'var(--color-hover)' : undefined }}
              onMouseEnter={() => setHi(i)}>
              {getLabel(o)}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: '6px 10px', color: 'var(--color-text-muted)', fontSize: 13 }}>{t('common.noResults')}</div>}
        </div>
      )}
    </div>
  );
}
