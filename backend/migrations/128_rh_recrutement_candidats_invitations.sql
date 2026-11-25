-- Sous-module Tests de recrutement — Lot 3 : candidats (externes, sans compte interne) et invitations
-- (accès au test : identifiant + mot de passe hashé + token de lien + validité). Migration additive.

-- ── Candidats (externes à CCG Flow) ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rh_recrutement_candidates (
  id                 SERIAL PRIMARY KEY,
  campaign_id        INTEGER NOT NULL REFERENCES rh_recrutement_campaigns(id) ON DELETE CASCADE,
  nom                TEXT NOT NULL,
  prenom             TEXT NOT NULL,
  email              TEXT,
  telephone          TEXT,
  adresse            TEXT,
  poste              TEXT,
  template_id        INTEGER REFERENCES rh_recrutement_templates(id),
  variant_id         INTEGER REFERENCES rh_recrutement_template_variants(id),
  statut             TEXT NOT NULL DEFAULT 'enregistre' CHECK (statut IN (
                       'enregistre', 'test_attribue', 'invitation_generee', 'invitation_envoyee',
                       'en_attente_demarrage', 'test_en_cours', 'test_soumis', 'test_expire',
                       'invitation_expiree', 'acces_suspendu', 'correction_en_attente',
                       'evaluation_en_attente', 'validation_rh_en_attente', 'resultat_valide',
                       'retenu', 'non_retenu', 'liste_attente')),
  decision           TEXT CHECK (decision IN ('retenu', 'non_retenu', 'liste_attente')),
  decision_motif     TEXT,
  commentaire_interne TEXT,
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_recr_candidates_camp ON rh_recrutement_candidates (campaign_id, statut);

-- ── Invitations / accès au test ───────────────────────────────────────────────────────────────────
-- Un accès par candidat (UNIQUE). Le token du lien est un secret opaque à haute entropie (48 hex
-- aléatoires) — non devinable, servi uniquement en HTTPS et jamais journalisé ; il est conservé en
-- clair pour permettre à la RH de ré-afficher / renvoyer le lien. Le mot de passe, lui, est hashé
-- (bcrypt) et n'est affiché qu'à la génération/réinitialisation. `actif` permet la révocation ;
-- `valid_from`/`expires_at` bornent la validité ; `duree_min`/`tentatives_max` paramètrent le passage
-- (chronomètre et tentatives gérés au lot 4, côté serveur).
CREATE TABLE IF NOT EXISTS rh_recrutement_invitations (
  id             SERIAL PRIMARY KEY,
  candidate_id   INTEGER NOT NULL UNIQUE REFERENCES rh_recrutement_candidates(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  login          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  template_id    INTEGER REFERENCES rh_recrutement_templates(id),
  variant_id     INTEGER REFERENCES rh_recrutement_template_variants(id),
  valid_from     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ,
  duree_min      INTEGER NOT NULL DEFAULT 40,
  tentatives_max INTEGER NOT NULL DEFAULT 1,
  actif          BOOLEAN NOT NULL DEFAULT true,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_recr_invitations_token ON rh_recrutement_invitations (token);
