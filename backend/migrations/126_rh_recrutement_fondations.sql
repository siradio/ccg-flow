-- Sous-module RH « Tests de recrutement » — Lot 0 : fondations (socle de données).
-- Intégré au module RH (gating par rôle rh/responsable, comme le reste du RH). Préfixe rh_recrutement_*
-- (cohérent avec rh_eval_*). Migration additive & idempotente. Les candidats externes, invitations,
-- tentatives et évaluations sont ajoutés dans les lots suivants (3/4/5).

-- ── Catégories / domaines de compétence évalués ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rh_recrutement_categories (
  id          SERIAL PRIMARY KEY,
  code        TEXT,
  nom         TEXT NOT NULL,
  description TEXT,
  ordre       INTEGER NOT NULL DEFAULT 100,
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Banque de questions ───────────────────────────────────────────────────────────────────────────
-- Le corrigé (explication) et les bonnes réponses (table options) ne doivent JAMAIS être exposés au
-- candidat : la correction se fait côté serveur. `version` : une modification incrémente la version ;
-- l'immuabilité d'un test déjà construit est garantie par le snapshot dans variant_questions.
CREATE TABLE IF NOT EXISTS rh_recrutement_questions (
  id             SERIAL PRIMARY KEY,
  code           TEXT,
  intitule       TEXT NOT NULL,
  description    TEXT,
  category_id    INTEGER REFERENCES rh_recrutement_categories(id),
  sous_categorie TEXT,
  niveau         TEXT NOT NULL DEFAULT 'moyen' CHECK (niveau IN ('facile', 'moyen', 'difficile')),
  type           TEXT NOT NULL DEFAULT 'qcm_unique' CHECK (type IN (
                   'qcm_unique', 'qcm_multiple', 'vrai_faux', 'texte_court',
                   'texte_long', 'numerique', 'mise_situation', 'fichier')),
  explication    TEXT,
  points         NUMERIC NOT NULL DEFAULT 1,
  duree_sec      INTEGER,
  entity_id      INTEGER REFERENCES entities(id),   -- NULL = périmètre groupe
  departement    TEXT,
  version        INTEGER NOT NULL DEFAULT 1,
  actif          BOOLEAN NOT NULL DEFAULT true,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_recr_questions_cat ON rh_recrutement_questions (category_id, actif);

-- Propositions de réponse (QCM / vrai-faux). `bon` = bonne réponse (confidentiel).
CREATE TABLE IF NOT EXISTS rh_recrutement_question_options (
  id          SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES rh_recrutement_questions(id) ON DELETE CASCADE,
  libelle     TEXT NOT NULL,
  bon         BOOLEAN NOT NULL DEFAULT false,
  ordre       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rh_recr_options_q ON rh_recrutement_question_options (question_id);

-- ── Modèles de test ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rh_recrutement_templates (
  id                          SERIAL PRIMARY KEY,
  titre                       TEXT NOT NULL,
  description                 TEXT,
  poste                       TEXT,
  entity_id                   INTEGER REFERENCES entities(id),
  departement                 TEXT,
  consignes                   TEXT,
  duree_min                   INTEGER NOT NULL DEFAULT 40,
  bareme_total                NUMERIC,
  seuil_reussite              NUMERIC,
  tentatives_autorisees       INTEGER NOT NULL DEFAULT 1,
  mode_correction             TEXT NOT NULL DEFAULT 'auto' CHECK (mode_correction IN ('auto', 'mixte', 'manuel')),
  afficher_resultat_candidat  BOOLEAN NOT NULL DEFAULT false,
  melange_questions           BOOLEAN NOT NULL DEFAULT false,
  melange_reponses            BOOLEAN NOT NULL DEFAULT false,
  statut                      TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'publie', 'archive')),
  version                     INTEGER NOT NULL DEFAULT 1,
  created_by                  INTEGER REFERENCES users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Variantes d'un modèle (A / B / C…) — permettent d'éviter des questionnaires identiques entre candidats.
CREATE TABLE IF NOT EXISTS rh_recrutement_template_variants (
  id          SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES rh_recrutement_templates(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  libelle     TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, code)
);
CREATE INDEX IF NOT EXISTS idx_rh_recr_variants_tpl ON rh_recrutement_template_variants (template_id);

-- Questions d'une variante : SNAPSHOT immuable (intitulé, type, barème, options) figé au moment de
-- l'ajout → modifier la banque ne change jamais une variante publiée ni un test déjà passé.
CREATE TABLE IF NOT EXISTS rh_recrutement_variant_questions (
  id          SERIAL PRIMARY KEY,
  variant_id  INTEGER NOT NULL REFERENCES rh_recrutement_template_variants(id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES rh_recrutement_questions(id),   -- origine (traçabilité)
  ordre       INTEGER NOT NULL DEFAULT 0,
  snapshot    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_recr_vq_variant ON rh_recrutement_variant_questions (variant_id);

-- ── Campagnes de recrutement ──────────────────────────────────────────────────────────────────────
-- Le « responsable de service » est DÉSIGNÉ explicitement sur la campagne (décision validée) : un
-- compte utilisateur, destinataire des notifications (il n'existe pas de référentiel Services normalisé).
CREATE TABLE IF NOT EXISTS rh_recrutement_campaigns (
  id                            SERIAL PRIMARY KEY,
  code                          TEXT,
  intitule                      TEXT NOT NULL,
  description                   TEXT,
  entity_id                     INTEGER REFERENCES entities(id),
  departement                   TEXT,
  poste                         TEXT,
  type_contrat                  TEXT,
  nb_postes                     INTEGER,
  date_debut                    DATE,
  date_fin                      DATE,
  responsable_rh_user_id        INTEGER REFERENCES users(id),
  responsable_service_user_id   INTEGER REFERENCES users(id),
  evaluateurs                   JSONB,          -- [user_id, …] évaluateurs complémentaires
  template_id                   INTEGER REFERENCES rh_recrutement_templates(id),
  ponderation                   JSONB,          -- { qcm:40, pratique:40, entretien:20 }
  statut                        TEXT NOT NULL DEFAULT 'brouillon'
                                 CHECK (statut IN ('brouillon', 'active', 'suspendue', 'cloturee', 'archivee')),
  created_by                    INTEGER REFERENCES users(id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_recr_campaigns_stat ON rh_recrutement_campaigns (statut, entity_id);
