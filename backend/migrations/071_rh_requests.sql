-- Module RH — Lot 1 : moteur de demandes RH générique (première brique : Demande d'absence).
-- En-tête commun à tous les types + historique + pièces jointes. Réutilise employees/entities/BU.

CREATE TABLE IF NOT EXISTS rh_requests (
  id                SERIAL PRIMARY KEY,
  numero            TEXT,
  type              TEXT NOT NULL DEFAULT 'absence' CHECK (type IN ('absence','conge','recrutement','cdi')),
  employee_id       INTEGER REFERENCES employees(id),          -- le collaborateur concerné
  created_by        INTEGER NOT NULL REFERENCES users(id),
  entity_id         INTEGER NOT NULL REFERENCES entities(id),
  business_unit_id  INTEGER REFERENCES business_units(id),
  statut            TEXT NOT NULL DEFAULT 'brouillon'
                    CHECK (statut IN ('brouillon','en_validation','validee','refusee','annulee','cloturee')),
  role_courant      TEXT,                                       -- rôle attendu à l'étape courante (validation par rôle) — évite le mot réservé PG `current_role`
  type_id           INTEGER REFERENCES rh_types(id),            -- type de congé / motif d'absence
  date_debut        DATE,
  date_fin          DATE,
  jours             NUMERIC(6,2),                               -- jours ouvrables calculés
  motif             TEXT,
  commentaire       TEXT,
  date_reprise      DATE,
  payload           JSONB,                                      -- champs spécifiques au type (évolutif)
  decided_by        INTEGER REFERENCES users(id),
  decided_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_requests_created_by ON rh_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_rh_requests_entity ON rh_requests(entity_id);
CREATE INDEX IF NOT EXISTS idx_rh_requests_statut ON rh_requests(statut);

CREATE TABLE IF NOT EXISTS rh_request_history (
  id             SERIAL PRIMARY KEY,
  rh_request_id  INTEGER NOT NULL REFERENCES rh_requests(id) ON DELETE CASCADE,
  action         TEXT NOT NULL,
  user_id        INTEGER REFERENCES users(id),
  commentaire    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_history_request ON rh_request_history(rh_request_id);

CREATE TABLE IF NOT EXISTS rh_attachments (
  id             SERIAL PRIMARY KEY,
  rh_request_id  INTEGER NOT NULL REFERENCES rh_requests(id) ON DELETE CASCADE,
  filename       TEXT NOT NULL,
  mime           TEXT,
  taille         INTEGER,
  content        BYTEA,
  content_key    TEXT,
  uploaded_by    INTEGER REFERENCES users(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_attachments_request ON rh_attachments(rh_request_id);
