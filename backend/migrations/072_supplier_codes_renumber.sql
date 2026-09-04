-- Renumérotation de TOUS les codes fournisseurs en FRN-### dans l'ordre de création (id croissant).
-- Remplace toute codification existante. Les codes fournisseurs ne servent qu'à l'affichage
-- (aucune référence technique : partout le fournisseur est référencé par son id) — sans risque.
-- Les nouveaux fournisseurs sont ensuite auto-numérotés côté service (FRN- + suivant).
--
-- IMPORTANT : la contrainte UNIQUE(code) est vérifiée LIGNE PAR LIGNE (non différée). Un UPDATE
-- ensembliste unique entrerait en collision temporaire (ex. #3 FRN-001->FRN-003 alors que #5 porte
-- encore FRN-003). On efface donc d'abord tous les codes (NULL, autorisé), puis on réassigne les
-- valeurs finales distinctes — aucune collision.
UPDATE suppliers SET code = NULL;

UPDATE suppliers s
SET code = 'FRN-' || LPAD(x.rn::text, 3, '0')
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM suppliers) x
WHERE s.id = x.id;
