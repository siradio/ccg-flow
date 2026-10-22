-- Module RH → Évaluation annuelle — Lot 0 (fondations).
-- Additif et idempotent. Crée le socle (référentiel de compétences, modèles réutilisables,
-- campagnes pilotées par les RH, fiches d'évaluation + lignes + historique + document).
-- Aucune UI ni comportement visible : les écrans et le workflow arrivent aux lots suivants.

-- 1) Référentiel de compétences (géré par les RH), organisé par catégorie.
CREATE TABLE IF NOT EXISTS rh_competence_categories (
  id      SERIAL PRIMARY KEY,
  code    TEXT,
  libelle TEXT NOT NULL UNIQUE,
  ordre   INTEGER NOT NULL DEFAULT 0,
  actif   BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS rh_competences (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES rh_competence_categories(id) ON DELETE SET NULL,
  code        TEXT,
  libelle     TEXT NOT NULL,
  description TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0,
  actif       BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_rh_competences_cat ON rh_competences(category_id);

-- 2) Modèles d'évaluation réutilisables (créés par les RH OU un manager).
CREATE TABLE IF NOT EXISTS rh_eval_templates (
  id          SERIAL PRIMARY KEY,
  nom         TEXT NOT NULL,
  description TEXT,
  poste_cible TEXT,                              -- pour proposer le bon modèle (optionnel)
  echelle_max INTEGER NOT NULL DEFAULT 5,        -- barème configurable
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rh_eval_template_items (
  id                SERIAL PRIMARY KEY,
  template_id       INTEGER NOT NULL REFERENCES rh_eval_templates(id) ON DELETE CASCADE,
  competence_id     INTEGER REFERENCES rh_competences(id) ON DELETE SET NULL,
  categorie_libelle TEXT,                         -- figé (regroupement stable)
  libelle           TEXT,                         -- figé
  ordre             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rh_eval_tpl_items ON rh_eval_template_items(template_id);

-- 3) Campagnes d'évaluation — ouvertes et clôturées par les RH.
CREATE TABLE IF NOT EXISTS rh_eval_campaigns (
  id                 SERIAL PRIMARY KEY,
  libelle            TEXT NOT NULL,
  annee              INTEGER NOT NULL,
  date_debut         DATE,
  date_fin           DATE,
  echelle_max        INTEGER NOT NULL DEFAULT 5,
  template_defaut_id INTEGER REFERENCES rh_eval_templates(id) ON DELETE SET NULL,
  statut             TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte','close')),
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Fiches d'évaluation (instances) + lignes + historique + document archivé.
CREATE TABLE IF NOT EXISTS rh_evaluations (
  id                   SERIAL PRIMARY KEY,
  numero               TEXT UNIQUE,              -- EVL-AAAA-#### (attribué à la création)
  campaign_id          INTEGER REFERENCES rh_eval_campaigns(id) ON DELETE SET NULL,
  employee_id          INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  manager_user_id      INTEGER REFERENCES users(id),     -- évaluateur (responsable)
  template_id          INTEGER REFERENCES rh_eval_templates(id) ON DELETE SET NULL,
  entity_id            INTEGER REFERENCES entities(id),
  business_unit_id     INTEGER REFERENCES business_units(id),
  annee                INTEGER,
  echelle_max          INTEGER NOT NULL DEFAULT 5,
  statut               TEXT NOT NULL DEFAULT 'brouillon'
                         CHECK (statut IN ('brouillon','auto_evaluation','evaluation_manager','avis_rh','cloturee','annulee')),
  step_index           INTEGER NOT NULL DEFAULT 0,
  auto_par_manager     BOOLEAN NOT NULL DEFAULT false,   -- employé sans compte : le manager remplit l'auto-éval
  points_forts         TEXT,
  axes_amelioration    TEXT,
  plan_carriere        TEXT,
  conclusion_manager   TEXT,
  avis_rh              TEXT,
  note_globale_employe  NUMERIC(5,2),
  note_globale_manager  NUMERIC(5,2),
  motif_annulation     TEXT,
  created_by           INTEGER REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at         TIMESTAMPTZ,
  decided_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rh_eval_employee ON rh_evaluations(employee_id);
CREATE INDEX IF NOT EXISTS idx_rh_eval_campaign ON rh_evaluations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rh_eval_statut   ON rh_evaluations(statut);
CREATE INDEX IF NOT EXISTS idx_rh_eval_manager  ON rh_evaluations(manager_user_id);

CREATE TABLE IF NOT EXISTS rh_evaluation_lignes (
  id                  SERIAL PRIMARY KEY,
  evaluation_id       INTEGER NOT NULL REFERENCES rh_evaluations(id) ON DELETE CASCADE,
  competence_id       INTEGER REFERENCES rh_competences(id) ON DELETE SET NULL,
  categorie_libelle   TEXT,
  libelle             TEXT NOT NULL,
  ordre               INTEGER NOT NULL DEFAULT 0,
  note_employe        INTEGER,
  note_manager        INTEGER,
  commentaire_manager TEXT
);
CREATE INDEX IF NOT EXISTS idx_rh_eval_lignes ON rh_evaluation_lignes(evaluation_id);

CREATE TABLE IF NOT EXISTS rh_evaluation_history (
  id            SERIAL PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES rh_evaluations(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  user_id       INTEGER REFERENCES users(id),
  commentaire   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_eval_hist ON rh_evaluation_history(evaluation_id);

CREATE TABLE IF NOT EXISTS rh_evaluation_documents (
  id            SERIAL PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES rh_evaluations(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'fiche',
  contenu       BYTEA,
  mime          TEXT NOT NULL DEFAULT 'application/pdf',
  genere_par    INTEGER REFERENCES users(id),
  genere_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, type)
);

-- 5) Seed : 3 catégories + compétences GÉNÉRIQUES (soft skills, valeurs). Les compétences
--    techniques sont propres au poste → laissées à la saisie des RH.
INSERT INTO rh_competence_categories (code, libelle, ordre) VALUES
  ('techniques',  'Compétences techniques', 1),
  ('soft_skills', 'Compétences comportementales (soft skills)', 2),
  ('valeurs',     'Valeurs', 3)
ON CONFLICT (libelle) DO NOTHING;

INSERT INTO rh_competences (category_id, libelle, ordre)
SELECT c.id, v.libelle, v.ordre
  FROM rh_competence_categories c
  CROSS JOIN (VALUES
    ('Leadership', 1), ('Organisation et planification', 2), ('Esprit d''analyse', 3),
    ('Capacité à gérer les priorités', 4), ('Résolution de conflits', 5),
    ('Sens de responsabilité', 6), ('Communication efficace', 7)
  ) AS v(libelle, ordre)
 WHERE c.libelle = 'Compétences comportementales (soft skills)'
   AND NOT EXISTS (SELECT 1 FROM rh_competences x WHERE x.category_id = c.id AND x.libelle = v.libelle);

INSERT INTO rh_competences (category_id, libelle, ordre)
SELECT c.id, v.libelle, v.ordre
  FROM rh_competence_categories c
  CROSS JOIN (VALUES
    ('Respect', 1), ('Engagement', 2), ('Standard de qualité', 3), ('Intégrité', 4), ('Innovation', 5)
  ) AS v(libelle, ordre)
 WHERE c.libelle = 'Valeurs'
   AND NOT EXISTS (SELECT 1 FROM rh_competences x WHERE x.category_id = c.id AND x.libelle = v.libelle);
