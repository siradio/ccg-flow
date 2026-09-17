-- ============================================================================
-- Module DSI — BU concernée (surtout SOGUIPAL) sur les objets clés, pour un suivi
-- par entité ET par business unit. Additif. Réutilise business_units existant.
-- ============================================================================
ALTER TABLE dsi_equipment  ADD COLUMN IF NOT EXISTS business_unit_id INTEGER REFERENCES business_units(id);
ALTER TABLE dsi_tickets    ADD COLUMN IF NOT EXISTS business_unit_id INTEGER REFERENCES business_units(id);
ALTER TABLE dsi_activities ADD COLUMN IF NOT EXISTS business_unit_id INTEGER REFERENCES business_units(id);
ALTER TABLE dsi_projects   ADD COLUMN IF NOT EXISTS business_unit_id INTEGER REFERENCES business_units(id);

CREATE INDEX IF NOT EXISTS idx_dsi_equipment_bu ON dsi_equipment(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_dsi_tickets_bu   ON dsi_tickets(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_dsi_activities_bu ON dsi_activities(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_dsi_projects_bu  ON dsi_projects(business_unit_id);
