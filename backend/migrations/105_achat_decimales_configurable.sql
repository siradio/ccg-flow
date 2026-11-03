-- Module Achat : nombre de décimales configurable (paramètre app_settings.achats_decimales).
-- La limite réelle était jusqu'ici dans la base (NUMERIC(18,4), cf. migration 091) : on élargit
-- l'échelle à 8 décimales pour permettre toute valeur de 0 à 8 pilotée depuis la configuration,
-- sans nouvelle migration. On passe de NUMERIC(18,4) à NUMERIC(22,8) : +4 décimales SANS réduire
-- la capacité entière (14 chiffres avant la virgule conservés). Opération sûre, sans perte.
ALTER TABLE purchase_requests      ALTER COLUMN montant_estime          TYPE NUMERIC(22,8);
ALTER TABLE purchase_requests      ALTER COLUMN montant_final           TYPE NUMERIC(22,8);
ALTER TABLE purchase_request_lines ALTER COLUMN quantite                TYPE NUMERIC(22,8);
ALTER TABLE purchase_request_lines ALTER COLUMN prix_unitaire_estime    TYPE NUMERIC(22,8);
ALTER TABLE purchase_request_lines ALTER COLUMN prix_unitaire_final     TYPE NUMERIC(22,8);
ALTER TABLE quotes                 ALTER COLUMN montant                 TYPE NUMERIC(22,8);
ALTER TABLE quote_lines            ALTER COLUMN prix_unitaire           TYPE NUMERIC(22,8);
ALTER TABLE purchase_orders        ALTER COLUMN montant                 TYPE NUMERIC(22,8);

-- Valeur par défaut du paramètre : 4 décimales (comportement actuel inchangé tant que la RH/l'admin
-- ne la modifie pas). Idempotent : ne touche pas une valeur déjà saisie.
INSERT INTO app_settings (key, value) VALUES ('achats_decimales', '4')
ON CONFLICT (key) DO NOTHING;
