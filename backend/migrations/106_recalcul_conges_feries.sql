-- Recalcul RÉTROACTIF du décompte des congés déjà saisis.
-- Le correctif (exclusion des jours fériés) ne s'appliquait qu'aux NOUVELLES demandes ; ici on
-- réapplique la règle à toutes les demandes de congé existantes : nombre de jours entre date_debut
-- et date_fin (incluses), semaine lundi→samedi (seuls les DIMANCHES et les JOURS FÉRIÉS paramétrés
-- dans rh_jours_feries sont exclus). Reproduit exactement la logique de rh.service.workingDays().
--
-- Le solde de congés est dérivé en direct de rh_requests.jours : le corriger suffit, aucune autre
-- table à toucher. Idempotent : relancer recalcule la même valeur (ne réécrit que si différent).
UPDATE rh_requests r
SET jours = sub.cnt, updated_at = now()
FROM (
  SELECT r2.id,
         COUNT(*) FILTER (
           WHERE EXTRACT(DOW FROM d.day) <> 0                 -- exclut les dimanches
             AND NOT EXISTS (                                  -- exclut les jours fériés
               SELECT 1 FROM rh_jours_feries f WHERE f.date = d.day::date
             )
         ) AS cnt
  FROM rh_requests r2
  CROSS JOIN LATERAL generate_series(r2.date_debut, r2.date_fin, interval '1 day') AS d(day)
  WHERE r2.type = 'conge'
    AND r2.date_debut IS NOT NULL
    AND r2.date_fin IS NOT NULL
    AND r2.date_fin >= r2.date_debut
  GROUP BY r2.id
) sub
WHERE r.id = sub.id
  AND r.jours IS DISTINCT FROM sub.cnt;
