-- Habillages événementiels de la page de connexion (fêtes, journées spéciales…).
-- Gérés par le super_admin : une image d'arrière-plan + un message facultatif, activés
-- manuellement (on/off). Un seul habillage actif à la fois (index partiel unique).
--
-- Stockage image : même schéma que les autres médias (photo véhicule/machine) — BYTEA
-- historique en repli, clé Azure Blob quand le stockage est configuré (voir storage/blob.js).

CREATE TABLE IF NOT EXISTS login_backgrounds (
  id          SERIAL PRIMARY KEY,
  nom         TEXT NOT NULL,
  message     TEXT,
  actif       BOOLEAN NOT NULL DEFAULT false,
  image_data  BYTEA,
  image_key   TEXT,
  image_mime  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garantit qu'au plus un habillage porte actif = true.
CREATE UNIQUE INDEX IF NOT EXISTS login_backgrounds_one_active
  ON login_backgrounds ((actif)) WHERE actif = true;
