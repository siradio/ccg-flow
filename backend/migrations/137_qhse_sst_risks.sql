-- Module QHSE — VOLET SST (Santé & Sécurité au Travail), domaine SST-02 : identification et
-- évaluation des risques professionnels. Cotation Risque = Gravité (G) × Probabilité (P) ×
-- Exposition (E), chaque facteur de 1 à 4 (score max 64). Niveau et seuils = proposition doc de
-- cadrage, à valider par l'entreprise. Migration additive.
CREATE TABLE IF NOT EXISTS qhse_sst_risks (
  id                 SERIAL PRIMARY KEY,
  unite_travail      TEXT,
  business_unit_id   INTEGER REFERENCES business_units(id),
  danger             TEXT,
  risque             TEXT,                                  -- effet / dommage possible
  personnes_exposees INTEGER,
  gravite            INTEGER CHECK (gravite BETWEEN 1 AND 4),
  probabilite        INTEGER CHECK (probabilite BETWEEN 1 AND 4),
  exposition         INTEGER CHECK (exposition BETWEEN 1 AND 4),
  score              INTEGER,
  niveau             TEXT,                                  -- faible / modere / eleve / critique
  mesures_existantes TEXT,
  mesures_prevues    TEXT,
  responsable        TEXT,
  echeance           DATE,
  statut             TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'maitrise')),
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_sst_risks ON qhse_sst_risks (statut, score DESC NULLS LAST);
