-- Module Achat : passer les montants / prix unitaires / quantités de 2 à 4 décimales.
-- Élargissement de l'échelle NUMERIC (opération sûre, sans perte : 2→4 ajoute de la précision).
ALTER TABLE purchase_requests      ALTER COLUMN montant_estime          TYPE NUMERIC(18,4);
ALTER TABLE purchase_requests      ALTER COLUMN montant_final           TYPE NUMERIC(18,4);
ALTER TABLE purchase_request_lines ALTER COLUMN quantite                TYPE NUMERIC(18,4);
ALTER TABLE purchase_request_lines ALTER COLUMN prix_unitaire_estime    TYPE NUMERIC(18,4);
ALTER TABLE purchase_request_lines ALTER COLUMN prix_unitaire_final     TYPE NUMERIC(18,4);
ALTER TABLE quotes                 ALTER COLUMN montant                 TYPE NUMERIC(18,4);
ALTER TABLE quote_lines            ALTER COLUMN prix_unitaire           TYPE NUMERIC(18,4);
ALTER TABLE purchase_orders        ALTER COLUMN montant                 TYPE NUMERIC(18,4);
