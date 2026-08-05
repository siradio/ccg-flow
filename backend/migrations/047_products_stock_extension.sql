-- Refonte Stock (Lot 0) — Extension du référentiel produits pour le nouveau module Stock.
-- Toutes les colonnes sont nullables / avec défaut : migration additive et réversible, aucun impact
-- sur les modules existants. On réutilise les colonnes déjà présentes (seuil_alerte_stock,
-- conditionnement, contenu_par_carton, kg_equivalent_carton, prix_suggere_gnf, format_taille).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS type_article             TEXT CHECK (type_article IN ('produit_fini', 'matiere_premiere', 'consommable', 'autre')),
  ADD COLUMN IF NOT EXISTS code_barres              TEXT,
  ADD COLUMN IF NOT EXISTS sous_categorie           TEXT,
  ADD COLUMN IF NOT EXISTS marque                   TEXT,
  ADD COLUMN IF NOT EXISTS unite_vente              TEXT,
  ADD COLUMN IF NOT EXISTS unite_conso              TEXT,
  ADD COLUMN IF NOT EXISTS coef_conversion          NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS cout_standard            NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS cout_moyen_pondere       NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS prix_vente_ht            NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS seuil_max                NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS stock_securite           NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS delai_reappro_jours      INTEGER,
  ADD COLUMN IF NOT EXISTS gere_par_lot             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gere_peremption          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duree_conservation_jours INTEGER,
  ADD COLUMN IF NOT EXISTS methode_valorisation     TEXT NOT NULL DEFAULT 'cmp' CHECK (methode_valorisation IN ('cmp', 'cout_standard', 'dernier_achat', 'fifo')),
  ADD COLUMN IF NOT EXISTS fournisseur_principal_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;

-- Amorce type_article depuis la catégorie existante (produit_fini vs matiere_premiere), le reste = 'autre'.
UPDATE products p SET type_article = CASE
    WHEN pc.code = 'produit_fini'     THEN 'produit_fini'
    WHEN pc.code = 'matiere_premiere' THEN 'matiere_premiere'
    WHEN pc.code = 'consommable'      THEN 'consommable'
    ELSE 'autre' END
  FROM product_categories pc
  WHERE p.category_id = pc.id AND p.type_article IS NULL;
