-- Profils d'accès « rôles » Logistique prêts à l'emploi, applicables à un utilisateur en un clic
-- (Admin → Utilisateurs → Profils d'accès). Idempotent (nom UNIQUE). Chaque profil = un ensemble de
-- niveaux sur les sous-modules Logistique. Modifiable/supprimable ensuite depuis l'écran des profils.
INSERT INTO access_profiles (nom, description, data) VALUES
  ('Logistique — Gestionnaire de flotte',
   'Édition sur Parc (véhicules), Missions et Checklists.',
   '{"roles":[],"businessUnits":[],"subModules":[{"key":"logistique.parc","niveau":"edition"},{"key":"logistique.missions","niveau":"edition"},{"key":"logistique.checklists","niveau":"edition"}]}'::jsonb),
  ('Logistique — Chauffeur',
   'Réalise les checklists (ajout) ; consulte les missions et le parc.',
   '{"roles":[],"businessUnits":[],"subModules":[{"key":"logistique.checklists","niveau":"ajout"},{"key":"logistique.missions","niveau":"consultation"},{"key":"logistique.parc","niveau":"consultation"}]}'::jsonb),
  ('Logistique — Consultation flotte',
   'Lecture seule sur toute la Logistique (Parc, Missions, Checklists).',
   '{"roles":[],"businessUnits":[],"subModules":[{"key":"logistique.parc","niveau":"consultation"},{"key":"logistique.missions","niveau":"consultation"},{"key":"logistique.checklists","niveau":"consultation"}]}'::jsonb)
ON CONFLICT (nom) DO NOTHING;
