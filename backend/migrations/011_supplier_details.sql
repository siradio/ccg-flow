-- Enrichit le référentiel Fournisseurs (§1.1 SPEC.md) avec les infos de suivi que l'utilisateur
-- tient aujourd'hui dans un fichier Excel externe (origine, pays, catégorie, offre, conditions de
-- paiement, contrat, commentaires) — objectif : que ce référentiel remplace ce fichier.
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS origine TEXT CHECK (origine IN ('Import', 'Local')),
  ADD COLUMN IF NOT EXISTS pays TEXT,
  ADD COLUMN IF NOT EXISTS categorie TEXT,
  ADD COLUMN IF NOT EXISTS produits_offres TEXT,
  ADD COLUMN IF NOT EXISTS mode_paiement TEXT,
  ADD COLUMN IF NOT EXISTS conditions_paiement TEXT,
  ADD COLUMN IF NOT EXISTS a_contrat BOOLEAN,
  ADD COLUMN IF NOT EXISTS commentaires TEXT;
