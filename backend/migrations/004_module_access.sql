-- Accès par module : couche indépendante des rôles métier du workflow Achat
-- (user_entity_roles). Un super_admin a toujours accès à tout (voir permissions.js) ;
-- pour tout autre utilisateur, l'accès à un module (RH, Achats, Stock, un référentiel
-- précis...) doit être explicitement accordé ici.
CREATE TABLE IF NOT EXISTS user_module_access (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_user_module_access_user ON user_module_access(user_id);
