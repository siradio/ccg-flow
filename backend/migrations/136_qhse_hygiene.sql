-- Module QHSE — VOLET HYGIÈNE. Moteur d'inspections génériques configurable : un type d'inspection
-- (PND/nettoyage, hygiène personnel, hygiène locaux, nuisibles, déchets…) porte ses propres critères
-- (check-list paramétrable, booléen ou numérique avec seuils). Les inspections relèvent les critères
-- et la conformité est calculée par le moteur commun (qhse.conformite). La surveillance micro de
-- l'environnement et l'eau se font via le module Analyses labo (types d'analyse dédiés). Migration additive.

-- Types d'inspection (référentiel).
CREATE TABLE IF NOT EXISTS qhse_inspection_types (
  id      SERIAL PRIMARY KEY,
  code    TEXT,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 100,
  actif   BOOLEAN NOT NULL DEFAULT true
);

-- Critères d'un type d'inspection (check-list paramétrable).
CREATE TABLE IF NOT EXISTS qhse_inspection_criteria (
  id                  SERIAL PRIMARY KEY,
  inspection_type_id  INTEGER REFERENCES qhse_inspection_types(id) ON DELETE CASCADE,
  code                TEXT,
  libelle             TEXT NOT NULL,
  type_critere        TEXT NOT NULL DEFAULT 'booleen' CHECK (type_critere IN ('booleen', 'numerique')),
  unite               TEXT,
  seuil_min           NUMERIC,
  seuil_max           NUMERIC,
  ordre               INTEGER NOT NULL DEFAULT 100,
  actif               BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_qhse_inspcrit_type ON qhse_inspection_criteria (inspection_type_id, actif);

-- Inspections réalisées.
CREATE TABLE IF NOT EXISTS qhse_inspections (
  id                 SERIAL PRIMARY KEY,
  date_inspection    DATE,
  inspection_type_id INTEGER REFERENCES qhse_inspection_types(id),
  zone               TEXT,
  business_unit_id   INTEGER REFERENCES business_units(id),
  responsable        TEXT,
  statut             TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'cloture')),
  conformite         TEXT,                                  -- conforme / non_conforme / en_attente / sans_spec
  commentaire        TEXT,
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by          INTEGER REFERENCES users(id),
  closed_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qhse_inspections ON qhse_inspections (inspection_type_id, date_inspection DESC);

-- Relevés d'une inspection (une ligne par critère renseigné).
CREATE TABLE IF NOT EXISTS qhse_inspection_results (
  id            SERIAL PRIMARY KEY,
  inspection_id INTEGER NOT NULL REFERENCES qhse_inspections(id) ON DELETE CASCADE,
  criteria_id   INTEGER REFERENCES qhse_inspection_criteria(id),
  valeur_bool   BOOLEAN,
  valeur_num    NUMERIC,
  conformite    TEXT,
  commentaire   TEXT
);
CREATE INDEX IF NOT EXISTS idx_qhse_inspresults ON qhse_inspection_results (inspection_id);

-- Amorçage des types d'inspection (uniquement si la table est vide) — aucun critère pré-rempli.
INSERT INTO qhse_inspection_types (code, libelle, ordre)
SELECT * FROM (VALUES
  ('PND', 'Nettoyage & désinfection (PND)', 10),
  ('PERSONNEL', 'Hygiène du personnel', 20),
  ('LOCAUX', 'Hygiène des locaux & équipements', 30),
  ('NUISIBLES', 'Lutte contre les nuisibles', 40),
  ('DECHETS', 'Gestion des déchets', 50),
  ('STOCKAGE', 'Hygiène du stockage & transport', 60)
) AS v(code, libelle, ordre)
WHERE NOT EXISTS (SELECT 1 FROM qhse_inspection_types);
