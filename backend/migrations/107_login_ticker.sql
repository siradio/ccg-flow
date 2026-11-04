-- Bandeau d'informations défilant de la page de connexion (configurable par le super_admin).
-- Valeurs par défaut dans app_settings : bandeau DÉSACTIVÉ au départ (aucun changement visible
-- tant que l'admin ne l'active pas). Idempotent (ne touche pas une valeur déjà saisie).
INSERT INTO app_settings (key, value) VALUES ('login_ticker_enabled', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('login_ticker_messages', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('login_ticker_speed', 'normal') ON CONFLICT (key) DO NOTHING;
