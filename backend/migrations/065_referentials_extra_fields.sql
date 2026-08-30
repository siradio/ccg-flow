-- Champs additionnels de référentiels (additif, idempotent).
-- Produits : « périssable » (gere_peremption) et durée de conservation existent déjà (migration 047).

-- Machines : cadence de production (quantité produite par minute).
ALTER TABLE machines ADD COLUMN IF NOT EXISTS cadence NUMERIC(12,2);

-- Fournisseurs : date d'engagement (depuis quand nous travaillons ensemble).
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS date_engagement DATE;

-- Parc auto (logistique) : capacité du réservoir de carburant (en litres).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS capacite_reservoir NUMERIC(10,2);
