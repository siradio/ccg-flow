-- ============================================================================
-- Module DSI — L4 : Journal des activités DSI. Additif.
-- Une activité peut être rattachée à un équipement, un utilisateur, un ticket, un
-- projet (FK ajoutée au L5). « fait_marquant » => remonte au rapport mensuel.
-- ============================================================================
CREATE TABLE IF NOT EXISTS dsi_activities (
  id                SERIAL PRIMARY KEY,
  date              DATE NOT NULL DEFAULT CURRENT_DATE,
  type_id           INTEGER REFERENCES dsi_activity_types(id),
  technician_id     INTEGER REFERENCES users(id),
  entity_id         INTEGER REFERENCES entities(id),
  site_id           INTEGER REFERENCES sites(id),
  description       TEXT NOT NULL,
  duree_min         INTEGER,
  equipment_id      INTEGER REFERENCES dsi_equipment(id),
  user_concerne_id  INTEGER REFERENCES users(id),
  project_id        INTEGER,             -- FK dsi_projects ajoutée au L5
  ticket_id         INTEGER REFERENCES dsi_tickets(id),
  resultat          TEXT,
  fait_marquant     BOOLEAN NOT NULL DEFAULT false,
  commentaire       TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dsi_act_date       ON dsi_activities(date);
CREATE INDEX IF NOT EXISTS idx_dsi_act_type       ON dsi_activities(type_id);
CREATE INDEX IF NOT EXISTS idx_dsi_act_technician ON dsi_activities(technician_id);
CREATE INDEX IF NOT EXISTS idx_dsi_act_equipment  ON dsi_activities(equipment_id);
CREATE INDEX IF NOT EXISTS idx_dsi_act_ticket     ON dsi_activities(ticket_id);
CREATE INDEX IF NOT EXISTS idx_dsi_act_project    ON dsi_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_dsi_act_marquant   ON dsi_activities(fait_marquant);
