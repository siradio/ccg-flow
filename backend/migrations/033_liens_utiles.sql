-- Module « Liens utiles » : un annuaire de liens rangés par catégorie (Manuels de procédure,
-- Templates, etc.), catégories extensibles à l'exécution. Remplace « Infos & Événements ». Chaque
-- lien porte un titre, une description et une URL cliquable. Même schéma que les catégories du
-- module Documents (suppression d'une catégorie → liens « sans catégorie », jamais perdus).
CREATE TABLE IF NOT EXISTS link_categories (
  id         SERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  ordre      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO link_categories (nom, slug, ordre) VALUES
  ('Manuels de procédure', 'manuels', 1),
  ('Templates', 'templates', 2)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS useful_links (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES link_categories(id) ON DELETE SET NULL,
  titre       TEXT NOT NULL,
  description TEXT,
  url         TEXT NOT NULL,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
