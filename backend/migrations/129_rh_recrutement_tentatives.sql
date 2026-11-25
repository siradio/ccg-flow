-- Sous-module Tests de recrutement — Lot 4 : passage du test par le candidat (portail externe).
-- Une tentative par candidat. Les questions de la tentative sont figées (snapshot, bonnes réponses
-- incluses mais JAMAIS servies au candidat) ; les réponses sont sauvegardées au fil de l'eau ; le
-- chronomètre et la correction automatique sont contrôlés CÔTÉ SERVEUR.

CREATE TABLE IF NOT EXISTS rh_recrutement_attempts (
  id               SERIAL PRIMARY KEY,
  candidate_id     INTEGER NOT NULL UNIQUE REFERENCES rh_recrutement_candidates(id) ON DELETE CASCADE,
  invitation_id    INTEGER REFERENCES rh_recrutement_invitations(id) ON DELETE SET NULL,
  template_id      INTEGER REFERENCES rh_recrutement_templates(id),
  variant_id       INTEGER REFERENCES rh_recrutement_template_variants(id),
  statut           TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'soumis', 'expire')),
  duree_min        INTEGER NOT NULL DEFAULT 40,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  submitted_at     TIMESTAMPTZ,
  temps_utilise_sec INTEGER,
  score_auto       NUMERIC,            -- points obtenus sur les questions auto-corrigées
  score_max        NUMERIC,            -- barème total
  note_sur_20      NUMERIC,
  corrige_manuel_requis BOOLEAN NOT NULL DEFAULT false, -- questions ouvertes en attente (lot 5)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_recr_attempts_statut ON rh_recrutement_attempts (statut, expires_at);

-- Questions figées de la tentative (ordre = ordre de présentation, déjà mélangé si le modèle le demande).
-- `snapshot` contient les bonnes réponses (pour la correction serveur) — jamais renvoyé tel quel au candidat.
CREATE TABLE IF NOT EXISTS rh_recrutement_attempt_questions (
  id         SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES rh_recrutement_attempts(id) ON DELETE CASCADE,
  ordre      INTEGER NOT NULL DEFAULT 0,
  snapshot   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_recr_aq_attempt ON rh_recrutement_attempt_questions (attempt_id, ordre);

-- Réponses du candidat (une par question de la tentative). `value` = JSON selon le type
-- ({selected:[idx…]} | {text:"…"} | {number:…}). Résultat de correction rempli au submit / lot 5.
CREATE TABLE IF NOT EXISTS rh_recrutement_attempt_answers (
  id                  SERIAL PRIMARY KEY,
  attempt_question_id INTEGER NOT NULL UNIQUE REFERENCES rh_recrutement_attempt_questions(id) ON DELETE CASCADE,
  value               JSONB,
  marque_a_revoir     BOOLEAN NOT NULL DEFAULT false,
  is_correct          BOOLEAN,
  points_obtenus      NUMERIC,
  corrige_manuel      BOOLEAN NOT NULL DEFAULT false,
  commentaire         TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
