-- Module Logistique → Autorisation de dépense — Lot 0 (fondations).
-- Additif et idempotent. Pose le socle : rôle « Opérations », référentiel des types de dépense
-- (paramétrable DANS le module Logistique), tables métier, et circuit de validation configurable
-- (réutilise le moteur de workflow générique). Les écrans de saisie/validation/PDF/dashboard
-- viennent aux lots suivants.

-- 1) Rôle de validation « Direction des Opérations » (les autres existent : controle_gestion, daf, dg).
ALTER TABLE user_entity_roles DROP CONSTRAINT IF EXISTS user_entity_roles_role_code_check;
ALTER TABLE user_entity_roles ADD CONSTRAINT user_entity_roles_role_code_check
  CHECK (role_code IN (
    'super_admin','demandeur','service_achat','controle_gestion','finances','validateur_besoin',
    'support_it','observateur_achats','rh','responsable','daf','dg',
    'responsable_commercial','gestionnaire_stock','operations'
  ));

-- 2) Référentiel « Types de dépense » — paramétrable depuis le module Logistique (onglet Configuration).
CREATE TABLE IF NOT EXISTS logistique_expense_types (
  id          SERIAL PRIMARY KEY,
  libelle     TEXT NOT NULL,
  ordre       INTEGER NOT NULL DEFAULT 0,
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO logistique_expense_types (libelle, ordre) VALUES
  ('Location de véhicule', 1),
  ('Carburant', 2),
  ('Péage & frais de route', 3),
  ('Entretien & réparation', 4),
  ('Transport / Fret', 5),
  ('Fournitures', 6),
  ('Autre', 99)
ON CONFLICT DO NOTHING;

-- 3) Autorisation de dépense (en-tête) + lignes + validations (approvals dédiées, comme les Achats).
CREATE TABLE IF NOT EXISTS expense_authorizations (
  id               SERIAL PRIMARY KEY,
  numero           TEXT UNIQUE,
  entity_id        INTEGER NOT NULL REFERENCES entities(id),
  business_unit_id INTEGER REFERENCES business_units(id),
  service          TEXT,
  objet            TEXT NOT NULL,
  expense_type_id  INTEGER REFERENCES logistique_expense_types(id),
  devise           TEXT NOT NULL DEFAULT 'GNF',
  montant_total    NUMERIC(18,2) NOT NULL DEFAULT 0,  -- coût total de la dépense
  avance           NUMERIC(18,2) NOT NULL DEFAULT 0,  -- avance déjà versée
  reste_a_payer    NUMERIC(18,2) NOT NULL DEFAULT 0,  -- montant réellement autorisé (= total - avance)
  statut           TEXT NOT NULL DEFAULT 'brouillon',
  current_step_id  INTEGER REFERENCES workflow_steps(id),
  demandeur_nom    TEXT,                               -- libellé figé du demandeur (fidèle à la fiche)
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_auth_entity ON expense_authorizations(entity_id);
CREATE INDEX IF NOT EXISTS idx_expense_auth_statut ON expense_authorizations(statut);

CREATE TABLE IF NOT EXISTS expense_authorization_lines (
  id               SERIAL PRIMARY KEY,
  authorization_id INTEGER NOT NULL REFERENCES expense_authorizations(id) ON DELETE CASCADE,
  designation      TEXT NOT NULL,
  quantite         NUMERIC(16,3) NOT NULL DEFAULT 1,
  prix_unitaire    NUMERIC(18,2) NOT NULL DEFAULT 0,
  montant          NUMERIC(18,2) NOT NULL DEFAULT 0,
  ordre            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_expense_lines_auth ON expense_authorization_lines(authorization_id);

CREATE TABLE IF NOT EXISTS expense_authorization_approvals (
  id               SERIAL PRIMARY KEY,
  authorization_id INTEGER NOT NULL REFERENCES expense_authorizations(id) ON DELETE CASCADE,
  workflow_step_id INTEGER NOT NULL REFERENCES workflow_steps(id),
  statut           TEXT NOT NULL DEFAULT 'en_attente',  -- en_attente | valide | refuse
  user_id          INTEGER REFERENCES users(id),
  commentaire      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_appr_auth ON expense_authorization_approvals(authorization_id);

-- 4) Circuit de validation configurable (moteur générique). Modifiable ensuite dans Admin → Workflows.
--    Création (Resp. Logistique) = saisie, gérée par le sous-module logistique.depenses (pas une étape).
INSERT INTO workflow_templates (module_code, nom, actif)
VALUES ('autorisation_depense', 'Autorisation de dépense', true)
ON CONFLICT DO NOTHING;

INSERT INTO workflow_steps
  (workflow_template_id, ordre, code, nom, role_code_requis,
   commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code)
SELECT t.id, v.ordre, v.code, v.nom, v.role, v.comm_oblig, v.comportement, v.retour
FROM workflow_templates t
CROSS JOIN (VALUES
  (1, 'operations',       'Direction des Opérations',               'operations',       true, 'annulation',              NULL),
  (2, 'controle_gestion', 'Contrôle de gestion',                    'controle_gestion', true, 'retour_etape_precedente', 'operations'),
  (3, 'daf',              'Direction Administrative et Financière',  'daf',              true, 'retour_etape_precedente', 'controle_gestion'),
  (4, 'validation_dga',   'Validation DGA',                          'dg',               true, 'retour_etape_precedente', 'daf')
) AS v(ordre, code, nom, role, comm_oblig, comportement, retour)
WHERE t.module_code = 'autorisation_depense'
ON CONFLICT (workflow_template_id, code) DO NOTHING;
