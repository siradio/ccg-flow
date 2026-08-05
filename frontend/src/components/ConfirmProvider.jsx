import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmContext = createContext(null);

// Remplace window.confirm() par une modale cohérente avec le reste de l'appli (thème clair/sombre,
// boutons .btn) — une seule à la fois, comme window.confirm(), donc pas de file d'attente à gérer.
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, title, confirmLabel, cancelLabel, danger }
  const resolveRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setState({
        message,
        title: options.title || null,
        confirmLabel: options.confirmLabel || 'Confirmer',
        cancelLabel: options.cancelLabel || 'Annuler',
        danger: options.danger || false,
      });
    });
  }, []);

  const respond = useCallback(ok => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    function onKeyDown(e) { if (e.key === 'Escape') respond(false); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, respond]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-overlay" onMouseDown={() => respond(false)}>
          <div className="modal-card" role="alertdialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
            {state.title && <h3 style={{ marginTop: 0 }}>{state.title}</h3>}
            <p>{state.message}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => respond(false)}>{state.cancelLabel}</button>
              <button type="button" className={state.danger ? 'btn btn-danger' : 'btn btn-primary'} autoFocus
                onClick={() => respond(true)}>
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// Retourne confirm(message, { title?, confirmLabel?, cancelLabel?, danger? }) => Promise<boolean>.
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm doit être utilisé sous ConfirmProvider.');
  return ctx;
}
