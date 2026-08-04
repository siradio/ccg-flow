-- Module "Documents" : catégories (sous-menus) extensibles + documents téléversés.
-- Les catégories sont pilotées par la base pour pouvoir en ajouter d'autres plus tard (au-delà des
-- "Manuels de procédures" et "Templates de documents" initiaux) sans changement de code.
CREATE TABLE document_categories (
  id         SERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  ordre      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO document_categories (nom, slug, ordre) VALUES
  ('Manuels de procédures', 'manuels', 1),
  ('Templates de documents', 'templates', 2);

CREATE TABLE procedure_documents (
  id           SERIAL PRIMARY KEY,
  category_id  INTEGER REFERENCES document_categories(id) ON DELETE SET NULL,
  nom          TEXT NOT NULL,
  description  TEXT,
  filename     TEXT,
  mime         TEXT,
  data         BYTEA NOT NULL,
  uploaded_by  INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Module "Infos & Événements" : annonces publiées par les personnes autorisées.
CREATE TABLE announcements (
  id             SERIAL PRIMARY KEY,
  titre          TEXT NOT NULL,
  contenu        TEXT,
  type           TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'evenement')),
  date_evenement DATE,
  lieu           TEXT,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
