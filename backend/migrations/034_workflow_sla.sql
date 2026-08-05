-- SLA (délai cible) configurable par étape de workflow, en JOURS. NULL = pas de SLA défini.
-- Sert à mesurer la performance de chaque étape (respect du délai) dans les rapports.
ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS sla_jours INTEGER;

-- Horodatage de PRISE EN CHARGE d'une étape de validation : la table `approvals` n'avait que
-- `decided_at` (fin) ; on ajoute `created_at` (début) pour calculer le temps réellement passé à
-- chaque étape = decided_at − created_at, comparé au SLA. Le suivi ne vaut que pour les validations
-- créées après cette migration.
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
