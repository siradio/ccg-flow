-- ============================================================================
-- Module DSI — L7 : Rapports mensuels DSI (génération auto, snapshot figé, PDF). Additif.
-- ============================================================================
CREATE TABLE IF NOT EXISTS dsi_reports (
  id             SERIAL PRIMARY KEY,
  annee          INTEGER NOT NULL,
  mois           INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
  entity_id      INTEGER REFERENCES entities(id),   -- NULL = toutes filiales (rapport global)
  responsable_id INTEGER REFERENCES users(id),
  statut         TEXT NOT NULL DEFAULT 'brouillon'
                 CHECK (statut IN ('brouillon','a_valider','valide','diffuse')),
  genere_le      TIMESTAMPTZ,
  valide_le      TIMESTAMPTZ,
  valide_par     INTEGER REFERENCES users(id),
  -- Snapshot des KPI + sections managériales éditables. Figé à la validation (verrouille=true) :
  -- une modification ultérieure d'un ticket/équipement/projet ne change plus un rapport validé.
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  verrouille     BOOLEAN NOT NULL DEFAULT false,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Un seul rapport par (année, mois, périmètre) — COALESCE pour traiter le global (NULL) comme 0.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dsi_reports_periode
  ON dsi_reports(annee, mois, COALESCE(entity_id, 0));
CREATE INDEX IF NOT EXISTS idx_dsi_reports_statut ON dsi_reports(statut);

-- Plan d'action du mois (permet le report automatique des actions non terminées au mois suivant).
CREATE TABLE IF NOT EXISTS dsi_report_actions (
  id             SERIAL PRIMARY KEY,
  report_id      INTEGER NOT NULL REFERENCES dsi_reports(id) ON DELETE CASCADE,
  libelle        TEXT NOT NULL,
  responsable_id INTEGER REFERENCES users(id),
  echeance       DATE,
  priorite       TEXT,
  statut         TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire','en_cours','termine')),
  ordre          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dsi_report_actions_report ON dsi_report_actions(report_id);
