-- Enrichit le référentiel Produits pour les produits finis suivis par Business Unit (module
-- Stock du Jour, et plus tard modules Ventes/Production) : conditionnement, prix suggéré,
-- équivalences poids — attributs venus du référentiel réel par BU (fichiers PILCO).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS conditionnement       TEXT,           -- ex: Seaux, Bouteille, Pots, Brassé, A boire, Poudre — format d'emballage, distinct de category_id (classification procurement)
  ADD COLUMN IF NOT EXISTS format_taille         NUMERIC(10, 3), -- taille de l'unité de vente, ex: 350, 500, 5, 20
  ADD COLUMN IF NOT EXISTS contenu_par_carton    NUMERIC(10, 3), -- nombre d'unités de vente par carton/casier
  ADD COLUMN IF NOT EXISTS kg_equivalent_carton  NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS prix_suggere_gnf      NUMERIC(14, 2);

INSERT INTO product_categories (code, nom) VALUES ('produit_fini', 'Produit fini')
ON CONFLICT (code) DO NOTHING;
