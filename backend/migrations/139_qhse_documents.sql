-- Module QHSE — Maîtrise documentaire (GED). Registre des documents QHSE contrôlés
-- (politiques, procédures, instructions, formulaires, enregistrements) avec cycle de vie
-- (brouillon → en_vigueur → obsolete), versions, dates d'application / de révision, circuit
-- rédaction/vérification/approbation, diffusion, et journal des révisions. Le fichier lui-même
-- reste stocké hors application : seule une référence (lien / emplacement) est conservée ici.
-- Migration additive.
CREATE TABLE IF NOT EXISTS qhse_documents (
  id               SERIAL PRIMARY KEY,
  reference        TEXT,
  titre            TEXT NOT NULL,
  type_document    TEXT NOT NULL DEFAULT 'procedure' CHECK (type_document IN (
                     'politique', 'manuel', 'procedure', 'instruction', 'formulaire', 'enregistrement', 'plan', 'autre')),
  domaine          TEXT CHECK (domaine IN ('qualite', 'hygiene', 'securite', 'environnement', 'transverse')),
  business_unit_id INTEGER REFERENCES business_units(id),
  version          TEXT NOT NULL DEFAULT '1',
  statut           TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'en_vigueur', 'obsolete')),
  date_application DATE,
  date_revision    DATE,
  redacteur        TEXT,
  verificateur     TEXT,
  approbateur      TEXT,
  emplacement      TEXT,
  diffusion        TEXT,
  observations     TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_documents ON qhse_documents (statut, type_document, date_revision);

CREATE TABLE IF NOT EXISTS qhse_document_revisions (
  id           SERIAL PRIMARY KEY,
  document_id  INTEGER NOT NULL REFERENCES qhse_documents(id) ON DELETE CASCADE,
  version      TEXT,
  date_revision DATE,
  motif        TEXT,
  par          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_doc_revisions ON qhse_document_revisions (document_id);
