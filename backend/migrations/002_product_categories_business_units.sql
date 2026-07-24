-- Rend les catégories de produits configurables (au lieu d'un CHECK figé dans le code),
-- et ajoute la notion de Business Unit (BU Lait, BU Tomate, BU Yaourt, BU Mayo Margarine).

CREATE TABLE IF NOT EXISTS product_categories (
  id   SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  nom  TEXT NOT NULL
);

INSERT INTO product_categories (code, nom) VALUES
  ('matiere_premiere', 'Matière première'),
  ('consommable', 'Consommable'),
  ('materiel_informatique', 'Matériel informatique'),
  ('piece_detachee', 'Pièce détachée'),
  ('autre', 'Autre')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS business_units (
  id   SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  nom  TEXT NOT NULL
);

INSERT INTO business_units (code, nom) VALUES
  ('bu_lait', 'BU Lait'),
  ('bu_tomate', 'BU Tomate'),
  ('bu_yaourt', 'BU Yaourt'),
  ('bu_mayo_margarine', 'BU Mayo Margarine')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES product_categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS business_unit_id INTEGER REFERENCES business_units(id);

-- Reprise des produits existants : leur ancien code de catégorie texte devient une vraie FK.
UPDATE products p SET category_id = pc.id
  FROM product_categories pc
  WHERE p.categorie = pc.code AND p.category_id IS NULL;

ALTER TABLE products ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE products DROP COLUMN categorie;
