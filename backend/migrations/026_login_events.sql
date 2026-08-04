-- Journal des connexions : une ligne par connexion réussie (voir auth.routes.js). Permet des
-- statistiques d'utilisation de la plateforme — nombre de connexions par utilisateur, dernière
-- connexion, utilisateurs actifs sur 7/30 jours, tendance jour par jour. Table dédiée (plutôt
-- qu'un compteur dénormalisé sur users) pour garder l'historique daté et pouvoir agréger n'importe
-- quelle fenêtre. Le suivi ne démarre qu'à partir du déploiement de cette migration.
CREATE TABLE IF NOT EXISTS login_events (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_events_user    ON login_events(user_id);
CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events(created_at);
