-- ============================================================================
-- Module DSI — L5 : Projets IT (+ tâches/jalons, membres) et Risques. Additif.
-- ============================================================================
CREATE TABLE IF NOT EXISTS dsi_projects (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  nom              TEXT NOT NULL,
  description      TEXT,
  responsable_id   INTEGER REFERENCES users(id),
  sponsor_id       INTEGER REFERENCES users(id),
  entity_id        INTEGER REFERENCES entities(id),
  date_debut       DATE,
  date_fin_prevue  DATE,
  date_fin_reelle  DATE,
  budget_prevu     NUMERIC(14,2),
  budget_consomme  NUMERIC(14,2),
  avancement_pct   INTEGER NOT NULL DEFAULT 0,
  priority_id      INTEGER REFERENCES dsi_priorities(id),
  statut           TEXT NOT NULL DEFAULT 'planifie'
                   CHECK (statut IN ('planifie','en_cours','en_attente','termine','annule')),
  risques          TEXT,
  commentaire      TEXT,
  deleted_at       TIMESTAMPTZ,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dsi_projects_statut ON dsi_projects(statut);
CREATE INDEX IF NOT EXISTS idx_dsi_projects_entity ON dsi_projects(entity_id);
CREATE INDEX IF NOT EXISTS idx_dsi_projects_deleted ON dsi_projects(deleted_at);

CREATE TABLE IF NOT EXISTS dsi_project_members (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES dsi_projects(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  role_projet  TEXT,
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS dsi_project_tasks (
  id             SERIAL PRIMARY KEY,
  project_id     INTEGER NOT NULL REFERENCES dsi_projects(id) ON DELETE CASCADE,
  libelle        TEXT NOT NULL,
  responsable_id INTEGER REFERENCES users(id),
  echeance       DATE,
  priority_id    INTEGER REFERENCES dsi_priorities(id),
  statut         TEXT NOT NULL DEFAULT 'a_faire'
                 CHECK (statut IN ('a_faire','en_cours','bloque','termine')),
  avancement_pct INTEGER NOT NULL DEFAULT 0,
  ordre          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dsi_tasks_project ON dsi_project_tasks(project_id);

CREATE TABLE IF NOT EXISTS dsi_risks (
  id             SERIAL PRIMARY KEY,
  reference      TEXT NOT NULL UNIQUE,
  sujet          TEXT NOT NULL,
  description    TEXT,
  category_id    INTEGER REFERENCES dsi_risk_categories(id),
  probabilite    INTEGER NOT NULL DEFAULT 1 CHECK (probabilite BETWEEN 1 AND 4),
  impact         INTEGER NOT NULL DEFAULT 1 CHECK (impact BETWEEN 1 AND 4),
  criticite      TEXT NOT NULL DEFAULT 'faible' CHECK (criticite IN ('faible','moyen','eleve','critique')),
  responsable_id INTEGER REFERENCES users(id),
  mitigation     TEXT,
  echeance       DATE,
  statut         TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','en_cours','maitrise','clos')),
  project_id     INTEGER REFERENCES dsi_projects(id),
  commentaire    TEXT,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dsi_risks_statut ON dsi_risks(statut);
CREATE INDEX IF NOT EXISTS idx_dsi_risks_criticite ON dsi_risks(criticite);
CREATE INDEX IF NOT EXISTS idx_dsi_risks_project ON dsi_risks(project_id);

-- FK différée dsi_activities.project_id -> dsi_projects (la colonne existe depuis le L4).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dsi_activities_project_fk') THEN
    ALTER TABLE dsi_activities ADD CONSTRAINT dsi_activities_project_fk
      FOREIGN KEY (project_id) REFERENCES dsi_projects(id);
  END IF;
END $$;
