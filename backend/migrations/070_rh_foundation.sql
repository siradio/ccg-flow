-- Module RH — Lot 0 (fondations). Additif, idempotent. Ne crée aucun écran ; pose le socle
-- (rôles RH, relation responsable, paramétrage) pour les lots suivants.

-- 1) Rôles de validation RH, attribués par entité comme les rôles Achats.
ALTER TABLE user_entity_roles DROP CONSTRAINT user_entity_roles_role_code_check;
ALTER TABLE user_entity_roles ADD CONSTRAINT user_entity_roles_role_code_check
  CHECK (role_code IN (
    'super_admin','demandeur','service_achat','controle_gestion','finances','validateur_besoin',
    'support_it','observateur_achats','rh','responsable','daf','dg'
  ));

-- 2) Relation « responsable hiérarchique » réelle : un employé pointe son responsable (un employé).
--    L'ancien champ texte `manager` est conservé (compatibilité) ; le nouveau lien permet de router
--    la validation vers le compte du responsable.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_employee_id INTEGER REFERENCES employees(id);

-- 3) Paramétrage RH : types de congé / motifs d'absence / motifs de recrutement (activables).
CREATE TABLE IF NOT EXISTS rh_types (
  id                   SERIAL PRIMARY KEY,
  domaine              TEXT NOT NULL CHECK (domaine IN ('conge','absence','recrutement')),
  code                 TEXT NOT NULL,
  libelle              TEXT NOT NULL,
  imputable_solde      BOOLEAN NOT NULL DEFAULT false,   -- pour les congés : décompte du solde
  justificatif_requis  BOOLEAN NOT NULL DEFAULT false,
  actif                BOOLEAN NOT NULL DEFAULT true,
  ordre                INTEGER NOT NULL DEFAULT 0,
  UNIQUE (domaine, code)
);
INSERT INTO rh_types (domaine, code, libelle, imputable_solde, justificatif_requis, ordre) VALUES
  ('conge','annuel','Congé annuel', true, false, 1),
  ('conge','sans_solde','Congé sans solde', false, false, 2),
  ('conge','exceptionnel','Congé exceptionnel', false, true, 3),
  ('conge','maladie','Congé maladie', false, true, 4),
  ('absence','maladie','Maladie', false, true, 1),
  ('absence','accident_travail','Accident de travail', false, true, 2),
  ('absence','autorisation','Absence autorisée', false, false, 3),
  ('absence','non_justifiee','Absence non justifiée', false, false, 4),
  ('recrutement','creation','Création de poste', false, false, 1),
  ('recrutement','remplacement','Remplacement', false, false, 2)
ON CONFLICT (domaine, code) DO NOTHING;

-- 4) Jours fériés (calcul des jours ouvrables des congés/absences).
CREATE TABLE IF NOT EXISTS rh_jours_feries (
  id       SERIAL PRIMARY KEY,
  date     DATE NOT NULL UNIQUE,
  libelle  TEXT NOT NULL
);
