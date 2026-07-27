-- Enrichit le référentiel Machines pour en faire un vrai "poste de charge" (work center) au sens
-- production/planification (SPEC.md §1.1) — jusqu'ici une simple fiche nom/référence/catégorie.
-- `reference` renommé en `code` pour rester cohérent avec les autres référentiels (entities,
-- products, business_units, product_categories utilisent tous `code`) ; table encore vide en
-- pratique (aucune donnée seedée, aucune autre table ne la référence — voir SPEC.md §1.1), le
-- renommage est donc sans risque.
ALTER TABLE machines RENAME COLUMN reference TO code;

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS calendrier_travail TEXT,
  ADD COLUMN IF NOT EXISTS capacite INTEGER,
  ADD COLUMN IF NOT EXISTS efficacite_pct NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS temps_preparation_min INTEGER,
  ADD COLUMN IF NOT EXISTS temps_nettoyage_min INTEGER,
  ADD COLUMN IF NOT EXISTS cout_horaire NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS oee_cible_pct NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS description TEXT;
