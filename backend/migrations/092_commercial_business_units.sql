-- Un commercial peut couvrir PLUSIEURS business units. `commerciaux.business_unit_id` reste la
-- « BU principale » (défaut d'attribution des objectifs/commissions et du versement) ; la table de
-- liaison ci-dessous enregistre l'ensemble des BU couvertes (principale incluse).
CREATE TABLE IF NOT EXISTS commercial_business_units (
  id               SERIAL PRIMARY KEY,
  commercial_id    INTEGER NOT NULL REFERENCES commerciaux(id) ON DELETE CASCADE,
  business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  UNIQUE (commercial_id, business_unit_id)
);
CREATE INDEX IF NOT EXISTS idx_commercial_bu_commercial ON commercial_business_units(commercial_id);
CREATE INDEX IF NOT EXISTS idx_commercial_bu_bu ON commercial_business_units(business_unit_id);

-- Reprise : chaque commercial couvre au minimum sa BU principale actuelle.
INSERT INTO commercial_business_units (commercial_id, business_unit_id)
SELECT id, business_unit_id FROM commerciaux WHERE business_unit_id IS NOT NULL
ON CONFLICT (commercial_id, business_unit_id) DO NOTHING;
