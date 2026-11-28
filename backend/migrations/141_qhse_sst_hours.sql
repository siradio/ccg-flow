-- Module QHSE — VOLET SST. Heures travaillées (saisie mensuelle par BU), base de calcul des
-- indicateurs de sinistralité : taux de fréquence (TF) et taux de gravité (TG). Rattachée au
-- sous-module qhse.sst_accidents. Migration additive.
--   TF = (nb accidents avec arrêt × 1 000 000) / heures travaillées
--   TG = (nb journées perdues × 1 000)       / heures travaillées
CREATE TABLE IF NOT EXISTS qhse_sst_hours (
  id               SERIAL PRIMARY KEY,
  business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  annee            INTEGER NOT NULL,
  mois             INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
  heures           NUMERIC NOT NULL DEFAULT 0,
  created_by       INTEGER REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_unit_id, annee, mois)
);
CREATE INDEX IF NOT EXISTS idx_qhse_sst_hours ON qhse_sst_hours (annee, business_unit_id);
