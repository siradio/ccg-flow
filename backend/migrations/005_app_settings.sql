-- Paramètres applicatifs simples (clé/valeur), modifiables par un super_admin sans redéploiement.
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Nombre minimum de fournisseurs à consulter avant de pouvoir lancer une demande de devis
-- (auparavant figé à 2 dans le code). Mettre à 1 désactive de fait la contrainte.
INSERT INTO app_settings (key, value) VALUES ('min_suppliers_devis', '2')
ON CONFLICT (key) DO NOTHING;
