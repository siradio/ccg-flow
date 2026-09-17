-- ============================================================================
-- Module DSI — L3 : Maintenance des équipements. Additif.
-- ============================================================================
CREATE TABLE IF NOT EXISTS dsi_maintenance (
  id                SERIAL PRIMARY KEY,
  equipment_id      INTEGER NOT NULL REFERENCES dsi_equipment(id),
  type_id           INTEGER REFERENCES dsi_maintenance_types(id),
  probleme          TEXT,
  diagnostic        TEXT,
  intervention      TEXT,
  technician_id     INTEGER REFERENCES users(id),
  prestataire       TEXT,
  date_debut        DATE,
  date_fin          DATE,
  cout              NUMERIC(14,2),
  pieces_remplacees TEXT,
  resultat          TEXT,
  next_date         DATE,              -- prochaine maintenance prévue
  statut            TEXT NOT NULL DEFAULT 'planifiee'
                    CHECK (statut IN ('planifiee','en_cours','terminee','annulee')),
  commentaire       TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dsi_maint_equipment ON dsi_maintenance(equipment_id);
CREATE INDEX IF NOT EXISTS idx_dsi_maint_statut    ON dsi_maintenance(statut);
CREATE INDEX IF NOT EXISTS idx_dsi_maint_technician ON dsi_maintenance(technician_id);
CREATE INDEX IF NOT EXISTS idx_dsi_maint_next      ON dsi_maintenance(next_date);
CREATE INDEX IF NOT EXISTS idx_dsi_maint_debut     ON dsi_maintenance(date_debut);
