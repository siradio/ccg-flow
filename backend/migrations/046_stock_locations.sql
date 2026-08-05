-- Refonte Stock (Lot 0) — Dimension LOCALISATION propre (Décision C). Dans ce projet entités et
-- business_units sont orthogonales (aucune hiérarchie) : une localisation se rattache donc de façon
-- OPTIONNELLE à un site, une entité et/ou une BU. Une zone est une localisation dont parent_id
-- pointe vers son entrepôt/magasin.
CREATE TABLE IF NOT EXISTS stock_locations (
  id                SERIAL PRIMARY KEY,
  code              TEXT UNIQUE,
  nom               TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'entrepot' CHECK (type IN ('entrepot', 'magasin', 'zone', 'transit')),
  parent_id         INTEGER REFERENCES stock_locations(id) ON DELETE SET NULL,
  site_id           INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  entity_id         INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  business_unit_id  INTEGER REFERENCES business_units(id) ON DELETE SET NULL,
  actif             BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_locations_bu     ON stock_locations(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_stock_locations_parent ON stock_locations(parent_id);
