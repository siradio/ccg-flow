-- Module Logistique — socle « Parc » : types de véhicule + véhicules (photo en base, comme les
-- machines). Le parc n'est PAS rattaché à une entité par défaut (entity_id NULLABLE — parc global) ;
-- un champ d'affectation générique pourra servir plus tard à une subdivision du parc sans migration
-- lourde. Photo stockée en BYTEA (robuste aux redéploiements Azure).
CREATE TABLE IF NOT EXISTS vehicle_types (
  id   SERIAL PRIMARY KEY,
  code TEXT,
  nom  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id                    SERIAL PRIMARY KEY,
  immatriculation       TEXT NOT NULL UNIQUE,
  type_id               INTEGER REFERENCES vehicle_types(id) ON DELETE SET NULL,
  marque                TEXT,
  modele                TEXT,
  annee                 INTEGER,
  entity_id             INTEGER REFERENCES entities(id) ON DELETE SET NULL,  -- facultatif (parc global)
  site_id               INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  statut                TEXT NOT NULL DEFAULT 'actif',                       -- actif | immobilise | reforme
  compteur_km           INTEGER,
  date_mise_circulation DATE,
  date_acquisition      DATE,
  photo                 BYTEA,
  photo_mime            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_type ON vehicles(type_id);
