-- ============================================================================
-- Module DSI — L2 : Tickets / Incidents / Demandes IT + SLA + timeline. Additif.
-- ============================================================================

CREATE TABLE IF NOT EXISTS dsi_tickets (
  id                    SERIAL PRIMARY KEY,
  reference             TEXT NOT NULL UNIQUE,
  demandeur_id          INTEGER NOT NULL REFERENCES users(id),
  technician_id         INTEGER REFERENCES users(id),
  category_id           INTEGER REFERENCES dsi_ticket_categories(id),
  type_id               INTEGER REFERENCES dsi_ticket_types(id),
  priority_id           INTEGER REFERENCES dsi_priorities(id),
  impact                TEXT,
  urgence               TEXT,
  equipment_id          INTEGER REFERENCES dsi_equipment(id),
  entity_id             INTEGER REFERENCES entities(id),
  site_id               INTEGER REFERENCES sites(id),
  objet                 TEXT NOT NULL,
  description           TEXT,
  statut                TEXT NOT NULL DEFAULT 'ouvert'
                        CHECK (statut IN ('ouvert','affecte','en_cours','en_attente','resolu','cloture','annule')),
  -- SLA copié à la création depuis la priorité (immuable ensuite) — base du calcul historique.
  sla_prise_en_charge_min INTEGER,
  sla_resolution_min      INTEGER,
  assigned_at           TIMESTAMPTZ,
  taken_at              TIMESTAMPTZ,   -- première prise en charge
  resolved_at           TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dsi_tickets_statut     ON dsi_tickets(statut);
CREATE INDEX IF NOT EXISTS idx_dsi_tickets_priority   ON dsi_tickets(priority_id);
CREATE INDEX IF NOT EXISTS idx_dsi_tickets_technician ON dsi_tickets(technician_id);
CREATE INDEX IF NOT EXISTS idx_dsi_tickets_demandeur  ON dsi_tickets(demandeur_id);
CREATE INDEX IF NOT EXISTS idx_dsi_tickets_equipment  ON dsi_tickets(equipment_id);
CREATE INDEX IF NOT EXISTS idx_dsi_tickets_entity     ON dsi_tickets(entity_id);
CREATE INDEX IF NOT EXISTS idx_dsi_tickets_created    ON dsi_tickets(created_at);

-- Timeline / historique d'un ticket. visibilite='public' = visible du demandeur ; 'interne' = DSI.
CREATE TABLE IF NOT EXISTS dsi_ticket_events (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES dsi_tickets(id),
  action      TEXT NOT NULL,          -- creation/affectation/statut/priorite/commentaire/intervention/sla_breach/resolution/cloture/reouverture
  from_value  TEXT,
  to_value    TEXT,
  comment     TEXT,
  visibilite  TEXT NOT NULL DEFAULT 'interne' CHECK (visibilite IN ('public','interne')),
  user_id     INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dsi_ticket_events_ticket ON dsi_ticket_events(ticket_id, created_at);
