-- Devises fournisseur (multi) + devise XOF (Franc CFA) autorisée + mode/conditions de paiement
-- repris sur le bon de commande. Additif, idempotent.

-- 1) Devises acceptées par le fournisseur (case à cocher côté UI).
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS devises TEXT[];

-- 2) Ajout de XOF (Franc CFA) aux devises autorisées (devis, demande d'achat, prix produit).
ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_devise_check;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_devise_check CHECK (devise IN ('GNF','USD','EUR','XOF'));

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_devise_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_devise_check CHECK (devise IN ('GNF','USD','EUR','XOF'));

ALTER TABLE product_prices DROP CONSTRAINT IF EXISTS product_prices_devise_check;
ALTER TABLE product_prices ADD CONSTRAINT product_prices_devise_check CHECK (devise IN ('GNF','USD','EUR','XOF'));

-- 3) Bon de commande : instantané du mode & des conditions de paiement (repris du fournisseur).
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS mode_paiement TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS conditions_paiement TEXT;
