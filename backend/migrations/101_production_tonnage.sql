-- Module Production — harmonisation en TONNES. Chaque produit a un conditionnement propre (grammes,
-- kg, cartons…). Pour tout ramener à une base commune, on ajoute au référentiel produits le pont
-- « poids » : Poids unitaire (g) = Format × Unités par colis × (kg→1000, sinon 1). C'est une propriété
-- fixe du produit (source de vérité unique, réutilisable par Production / Stock / Ventes).
--
-- Le relevé de production (production_entries) FIGE un snapshot du poids unitaire à la saisie, et la
-- quantité en tonnes est calculée = quantité × poids_unitaire_g ÷ 1 000 000 (colonne générée) :
-- ainsi corriger le conditionnement d'un produit plus tard ne modifie pas les tonnages historiques.

-- 1) Référentiel produits : attributs de conditionnement + poids unitaire calculé (colonne générée).
ALTER TABLE products ADD COLUMN IF NOT EXISTS pds_format            NUMERIC(12, 4);  -- Format (taille de base), ex. 350, 125, 2.5, 20
ALTER TABLE products ADD COLUMN IF NOT EXISTS pds_unites_par_colis  NUMERIC(12, 4);  -- « Unité vente » : nb d'unités de base par conditionnement, ex. 1, 4, 25
ALTER TABLE products ADD COLUMN IF NOT EXISTS pds_unite             TEXT CHECK (pds_unite IN ('g', 'ml', 'kg'));  -- unité de base du Format
ALTER TABLE products ADD COLUMN IF NOT EXISTS poids_unitaire_g      NUMERIC(16, 4)
  GENERATED ALWAYS AS (pds_format * pds_unites_par_colis * (CASE pds_unite WHEN 'kg' THEN 1000 ELSE 1 END)) STORED;

-- 2) Relevé de production : snapshot du poids unitaire + quantité en tonnes (calculée).
ALTER TABLE production_entries ADD COLUMN IF NOT EXISTS poids_unitaire_g NUMERIC(16, 4);  -- figé à la saisie depuis le produit
ALTER TABLE production_entries ADD COLUMN IF NOT EXISTS quantite_tonnes  NUMERIC(18, 6)
  GENERATED ALWAYS AS (quantite * COALESCE(poids_unitaire_g, 0) / 1000000) STORED;
