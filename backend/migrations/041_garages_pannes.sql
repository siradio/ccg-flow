-- Module Logistique — maintenance : garages partenaires + déclaration de pannes (avec photos).
-- Les réparations (lien panne↔garage + auto-statut véhicule) arrivent dans un incrément suivant.
CREATE TABLE IF NOT EXISTS garages (
  id            SERIAL PRIMARY KEY,
  nom           TEXT NOT NULL,
  ville         TEXT,
  sous_contrat  BOOLEAN NOT NULL DEFAULT false,
  specialites   TEXT,                 -- ex. « moteur · freinage »
  efficacite_pct INTEGER,
  telephone     TEXT,
  notes         TEXT,
  actif         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pannes (
  id           SERIAL PRIMARY KEY,
  reference    TEXT UNIQUE,
  vehicle_id   INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  gravite      TEXT NOT NULL DEFAULT 'Majeure',   -- Mineure | Majeure | Critique
  description  TEXT NOT NULL,
  localisation TEXT,
  statut       TEXT NOT NULL DEFAULT 'Déclarée',  -- Déclarée | En réparation | Réparée | Clôturée
  declare_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS panne_photos (
  id         SERIAL PRIMARY KEY,
  panne_id   INTEGER NOT NULL REFERENCES pannes(id) ON DELETE CASCADE,
  photo      BYTEA NOT NULL,
  photo_mime TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pannes_vehicle ON pannes(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_panne_photos_panne ON panne_photos(panne_id);
