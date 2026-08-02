import { useState } from 'react';

// Bouton qui se désactive et affiche un loader pendant l'exécution de son action asynchrone —
// évite les doubles clics/doubles appels API sur les actions de workflow (valider, refuser, etc.).
export default function AsyncButton({ onClick, className = 'btn btn-primary', disabled, children, ...rest }) {
  const [busy, setBusy] = useState(false);

  async function handleClick(e) {
    setBusy(true);
    try {
      await onClick(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={className} disabled={disabled || busy} onClick={handleClick} {...rest}>
      {busy && <span className="btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
