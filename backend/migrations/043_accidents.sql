-- Module Logistique — Accidents : déclaration (véhicule, description, localisation, tiers impliqué,
-- statut) + justificatifs/photos multiples en base. Référence AC-XXXX générée à la création.
CREATE TABLE IF NOT EXISTS accidents (
  id             SERIAL PRIMARY KEY,
  reference      TEXT UNIQUE,
  vehicle_id     INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,
  localisation   TEXT,
  tiers_implique BOOLEAN NOT NULL DEFAULT false,
  statut         TEXT NOT NULL DEFAULT 'Déclaré',   -- Déclaré | En cours | Clôturé
  declare_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accident_photos (
  id          SERIAL PRIMARY KEY,
  accident_id INTEGER NOT NULL REFERENCES accidents(id) ON DELETE CASCADE,
  photo       BYTEA NOT NULL,
  photo_mime  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accidents_vehicle ON accidents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_accident_photos_accident ON accident_photos(accident_id);
