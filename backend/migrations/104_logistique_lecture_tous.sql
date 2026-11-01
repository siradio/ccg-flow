-- Accès LECTURE SEULE à TOUT le module Logistique (ses 7 sous-modules) pour tous les comptes
-- ACTIFS existants, à la demande (accès en consultation pour tout le monde).
--
-- Idempotent : ON CONFLICT DO NOTHING ne rétrograde personne — un niveau 'ajout' ou 'edition'
-- déjà accordé sur un sous-module est préservé. N'ajoute 'consultation' que là où aucun accès
-- n'existe encore. Les super_admin ont déjà tout sans octroi explicite.
--
-- Portée : uniquement les comptes présents au moment de l'exécution (décision du 2026-11-01 :
-- « comptes actuels seulement »). Les futurs comptes devront être habilités séparément.
INSERT INTO user_sub_module_access (user_id, sub_module_key, niveau)
SELECT u.id, k.key, 'consultation'
FROM users u
CROSS JOIN (VALUES
  ('logistique.parc'),
  ('logistique.missions'),
  ('logistique.checklists'),
  ('logistique.maintenance'),
  ('logistique.carburant'),
  ('logistique.accidents'),
  ('logistique.suivi')
) AS k(key)
WHERE u.actif = true AND u.access_status = 'active'
ON CONFLICT (user_id, sub_module_key) DO NOTHING;
