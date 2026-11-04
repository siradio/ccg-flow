-- Page de connexion : période d'affichage du bandeau (du/au, vides = toujours) et variante
-- d'animation du fond (reseau | aurore | combine ; défaut « combine »). Idempotent.
INSERT INTO app_settings (key, value) VALUES ('login_ticker_from', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('login_ticker_to', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('login_anim_variant', 'combine') ON CONFLICT (key) DO NOTHING;
