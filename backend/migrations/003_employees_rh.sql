-- Étend le référentiel employés avec les informations RH complètes (module employés,
-- basé sur le fichier Saisie_Employés utilisé aujourd'hui par le service RH).
--
-- Le "matricule" du fichier source n'est PAS unique dans les faits (deux employés
-- distincts peuvent partager le même code, ~59 cas constatés à l'import) : on le
-- garde comme champ indexé pour la recherche, jamais comme contrainte d'unicité.

ALTER TABLE employees RENAME COLUMN service TO departement;

ALTER TABLE employees
  ADD COLUMN business_unit_id INTEGER REFERENCES business_units(id),
  ADD COLUMN manager         TEXT,
  ADD COLUMN date_embauche   DATE,
  ADD COLUMN type_contrat    TEXT CHECK (type_contrat IN ('CDI', 'CDD', 'Stage', 'Consultant', 'Journalier')),
  ADD COLUMN statut          TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif', 'sorti')),
  ADD COLUMN salaire_mensuel NUMERIC(14, 2),
  ADD COLUMN telephone       TEXT,
  ADD COLUMN email           TEXT;

UPDATE employees SET statut = CASE WHEN actif THEN 'actif' ELSE 'inactif' END;
ALTER TABLE employees DROP COLUMN actif;

CREATE INDEX IF NOT EXISTS idx_employees_matricule ON employees(matricule);
CREATE INDEX IF NOT EXISTS idx_employees_business_unit ON employees(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_employees_statut ON employees(statut);
