-- Page de connexion : animations d'ACCENT optionnelles, qui se posent PAR-DESSUS le fond par
-- défaut (réseau de nœuds + aurore). Liste de clés séparées par des virgules, activées à la
-- demande par le super_admin. Défaut '' = aucune animation d'accent, l'existant reste le défaut.
-- Clés possibles : orbit | ring | flow | wave | cascade. Idempotent.
INSERT INTO app_settings (key, value) VALUES ('login_accent_anims', '') ON CONFLICT (key) DO NOTHING;
