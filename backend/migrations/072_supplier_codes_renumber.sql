-- Renumérotation de TOUS les codes fournisseurs en FRN-### dans l'ordre de création (id croissant).
-- Remplace toute codification existante. Les codes fournisseurs ne servent qu'à l'affichage
-- (aucune référence technique : partout le fournisseur est référencé par son id) — sans risque.
-- Les nouveaux fournisseurs sont ensuite auto-numérotés côté service (FRN- + suivant).
-- UPDATE ensembliste : toutes les valeurs finales sont distinctes, aucune collision intermédiaire.
UPDATE suppliers s
SET code = 'FRN-' || LPAD(x.rn::text, 3, '0')
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM suppliers) x
WHERE s.id = x.id;
