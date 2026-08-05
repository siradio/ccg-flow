-- Module Logistique — Documents & échéances véhicule. On stocke les MÉTADONNÉES du document
-- (type, numéro, dates, dont l'échéance date_fin) + un LIEN optionnel vers le scan (OneDrive) —
-- pas le fichier lui-même, pour ne pas alourdir le stockage. La date_fin alimente la vue Échéances
-- et, plus tard, des alertes.
CREATE TABLE IF NOT EXISTS vehicle_documents (
  id         SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,         -- Assurance | Carte grise | Visite technique | Vignette | Autre
  numero     TEXT,
  date_debut DATE,
  date_fin   DATE,                  -- échéance
  lien       TEXT,                  -- URL optionnelle vers le scan (OneDrive…)
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle ON vehicle_documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_datefin ON vehicle_documents(date_fin);
