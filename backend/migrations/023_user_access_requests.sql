-- Demande d'accès depuis la page de connexion : un visiteur crée une demande qui devient un compte
-- au statut "pending" (à valider). L'admin/IT le valide (-> active) ou le rejette (-> rejected).
-- Les comptes existants sont "active" par défaut.
ALTER TABLE users
  ADD COLUMN access_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN telephone TEXT,
  ADD COLUMN fonction TEXT;

ALTER TABLE users
  ADD CONSTRAINT users_access_status_check CHECK (access_status IN ('active', 'pending', 'rejected'));
