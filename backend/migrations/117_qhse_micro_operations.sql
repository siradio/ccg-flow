-- Module QHSE — Lot 1. Sections opératoires de la paillasse microbiologique (EN-CQ05) :
-- 2) suspension mère, 3) préparation des milieux de culture, 4) incubation. Traçabilité de
-- manipulation rattachée à une analyse microbiologique (pas porteur de conformité : la conformité
-- vient des résultats, section 5, déjà gérée par qhse_results). Tables additives/idempotentes.

-- Section 2 — suspension mère (une par analyse).
CREATE TABLE IF NOT EXISTS qhse_micro_operations (
  analysis_id      INTEGER PRIMARY KEY REFERENCES qhse_analyses(id) ON DELETE CASCADE,
  facteur_dilution TEXT,
  type_diluant     TEXT,          -- ex. EPT SC / EPT DC (simple / double concentration)
  suspension_tech  TEXT,
  suspension_date  DATE,
  notes            TEXT
);

-- Section 3 — préparation des milieux de culture (plusieurs par analyse).
CREATE TABLE IF NOT EXISTS qhse_micro_media (
  id              SERIAL PRIMARY KEY,
  analysis_id     INTEGER NOT NULL REFERENCES qhse_analyses(id) ON DELETE CASCADE,
  culture_media_id INTEGER REFERENCES qhse_culture_media(id) ON DELETE SET NULL,
  pesee           TEXT,
  ph_ok           BOOLEAN,
  repartition     TEXT,
  chauffage_ok    BOOLEAN,
  autoclavage_ok  BOOLEAN,
  controle_ok     BOOLEAN,
  date_prep       DATE,
  preparateur     TEXT,
  lot_milieu      TEXT,
  ordre           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qhse_micro_media_analysis ON qhse_micro_media(analysis_id);

-- Section 4 — incubation (plusieurs par analyse, un par germe recherché).
CREATE TABLE IF NOT EXISTS qhse_micro_incubations (
  id          SERIAL PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES qhse_analyses(id) ON DELETE CASCADE,
  germ_id     INTEGER REFERENCES qhse_germs(id) ON DELETE SET NULL,
  germ_libre  TEXT,
  temperature TEXT,
  duree       TEXT,
  oxygenation TEXT,
  equipement  TEXT,
  debut       DATE,
  fin         DATE,
  lot_bp      TEXT,
  technicien  TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qhse_micro_incub_analysis ON qhse_micro_incubations(analysis_id);
