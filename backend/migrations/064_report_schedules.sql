-- Rapports planifiés — envoi périodique de rapports (production, stock, achats) par e-mail à une
-- liste de diffusion. Un tick (node-cron) évalue les planifications dues et les exécute.

CREATE TABLE IF NOT EXISTS report_schedules (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL,                 -- type de rapport : production_bu | stock_bu | achats
  libelle          TEXT NOT NULL,
  actif            BOOLEAN NOT NULL DEFAULT true,
  frequence        TEXT NOT NULL DEFAULT 'quotidien'
                     CHECK (frequence IN ('quotidien','hebdomadaire','mensuel')),
  jour_semaine     INTEGER,                        -- 1=lundi … 7=dimanche (hebdomadaire)
  jour_mois        INTEGER,                        -- 1..28 (mensuel)
  heure            TEXT NOT NULL DEFAULT '07:00',  -- HH:MM, heure locale (Africa/Conakry, UTC+0)
  business_unit_id INTEGER REFERENCES business_units(id) ON DELETE SET NULL,  -- filtre (NULL = toutes)
  format           TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf','html')),
  destinataires    TEXT NOT NULL DEFAULT '',       -- liste d'e-mails (séparés par , ; ou espace)
  last_run_at      TIMESTAMPTZ,
  last_status      TEXT,
  last_error       TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       INTEGER REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_sched_actif ON report_schedules(actif);

-- Historique des exécutions (traçabilité + garde anti-doublon complémentaire).
CREATE TABLE IF NOT EXISTS report_runs (
  id            SERIAL PRIMARY KEY,
  schedule_id   INTEGER REFERENCES report_schedules(id) ON DELETE CASCADE,
  run_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  statut        TEXT NOT NULL,                     -- ok | error | skipped
  destinataires TEXT,
  message       TEXT,
  declenche_par INTEGER REFERENCES users(id)       -- NULL = automatique (scheduler)
);
CREATE INDEX IF NOT EXISTS idx_report_runs_sched ON report_runs(schedule_id, run_at DESC);
