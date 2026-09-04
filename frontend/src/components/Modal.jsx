import { useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext';

// Modale générique (réutilise .modal-overlay / .modal-card du thème, comme ConfirmProvider).
// Fermeture par Échap, clic sur le fond, ou bouton ✕. `wide` élargit pour les formulaires longs.
export default function Modal({ title, onClose, children, wide = false }) {
  const { t } = useI18n();
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className={`modal-card modal-card-form${wide ? ' modal-card-wide' : ''}`}
        role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-form-header">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
