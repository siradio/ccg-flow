-- Module Commerce : ajoute la BU « Divers » au référentiel business_units.
-- Côté commercial, « Divers » regroupe les activités Mayo/Margarine, Lait et Tomate — on peut ainsi
-- affecter un commercial au groupement « Divers » (comme le fichier Excel « DIVERS » vs « BEST YAOURT »).
-- Le référentiel Produits garde ses BU spécifiques (le produit reste rattaché à sa BU d'origine) ;
-- « Divers » est une unité d'affectation commerciale.
INSERT INTO business_units (code, nom) VALUES ('bu_divers', 'Divers')
ON CONFLICT (code) DO NOTHING;
