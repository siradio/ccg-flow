-- Progression du circuit RH par INDEX d'étape (et non plus par rôle seul), pour supporter un rôle
-- répété dans une chaîne (ex. congé : RH → Responsable → RH). step_index = position courante.
ALTER TABLE rh_requests ADD COLUMN IF NOT EXISTS step_index INTEGER NOT NULL DEFAULT 0;
