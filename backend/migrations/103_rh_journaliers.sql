-- Module RH — Demande de journaliers (travailleurs journaliers). Chaque vendredi, les directeurs de
-- BU (rôle responsable) demandent un nombre de journaliers par JOUR (lun→dim) et par TYPE DE TÂCHE
-- (configurable par les RH) pour la semaine suivante. Circuit : demandeur → DAF → DGA → RH.
-- On réutilise le moteur rh_requests (en-tête/statut/historique/notifications) avec type='journaliers'
-- (date_debut = lundi, date_fin = dimanche) + une table de lignes (jour × tâche × nombre) pour des
-- statistiques fiables.

-- 1) Autorise le nouveau type sur l'en-tête commun.
ALTER TABLE rh_requests DROP CONSTRAINT IF EXISTS rh_requests_type_check;
ALTER TABLE rh_requests ADD CONSTRAINT rh_requests_type_check
  CHECK (type IN ('absence', 'conge', 'recrutement', 'cdi', 'journaliers'));

-- 2) Référentiel des types de tâches journalières (configurable par les RH).
CREATE TABLE IF NOT EXISTS rh_task_types (
  id         SERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  actif      BOOLEAN NOT NULL DEFAULT true,
  ordre      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO rh_task_types (nom, ordre) VALUES
  ('Emballage', 1), ('Nettoyage', 2), ('Manutention', 3), ('Production', 4), ('Chargement', 5)
ON CONFLICT DO NOTHING;

-- 3) Lignes d'une demande : nombre de journaliers par jour (1=lundi … 7=dimanche) et par tâche.
CREATE TABLE IF NOT EXISTS rh_journaliers_lines (
  id             SERIAL PRIMARY KEY,
  rh_request_id  INTEGER NOT NULL REFERENCES rh_requests(id) ON DELETE CASCADE,
  jour           INTEGER NOT NULL CHECK (jour BETWEEN 1 AND 7),
  task_type_id   INTEGER NOT NULL REFERENCES rh_task_types(id),
  nombre         INTEGER NOT NULL CHECK (nombre >= 0),
  UNIQUE (rh_request_id, jour, task_type_id)
);
CREATE INDEX IF NOT EXISTS idx_rh_journaliers_request ON rh_journaliers_lines(rh_request_id);
