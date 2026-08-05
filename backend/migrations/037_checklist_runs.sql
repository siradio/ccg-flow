-- Module Logistique — Checklists chauffeurs : RÉALISATIONS. Un chauffeur remplit un modèle pour un
-- véhicule (et éventuellement une mission). Chaque item réalisé porte un statut (ok/ko/na), un
-- commentaire et, en option, une PHOTO (preuve : pneu abîmé, choc…), stockée en base comme les
-- photos de véhicule. Les libellés/type sont recopiés (snapshot) pour rester lisibles même si le
-- modèle change ensuite.
CREATE TABLE IF NOT EXISTS checklist_runs (
  id           SERIAL PRIMARY KEY,
  template_id  INTEGER REFERENCES checklist_templates(id) ON DELETE SET NULL,
  template_nom TEXT,
  type         TEXT,
  vehicle_id   INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id    INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  mission_id   INTEGER REFERENCES missions(id) ON DELETE SET NULL,
  notes        TEXT,
  realise_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_run_items (
  id          SERIAL PRIMARY KEY,
  run_id      INTEGER NOT NULL REFERENCES checklist_runs(id) ON DELETE CASCADE,
  libelle     TEXT NOT NULL,
  statut      TEXT NOT NULL DEFAULT 'na',   -- ok | ko | na
  commentaire TEXT,
  photo       BYTEA,
  photo_mime  TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_run_items_run ON checklist_run_items(run_id);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_vehicle ON checklist_runs(vehicle_id);
