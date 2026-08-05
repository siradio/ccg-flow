-- Conducteurs : distinguer explicitement un chauffeur INTERNE (employé) d'un PRESTATAIRE (externe /
-- intérimaire), pour la saisie et surtout pour les statistiques futures (comparaison interne vs
-- prestataire : coût, disponibilité, comportement). `societe` = nom du prestataire, le cas échéant.
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS type_conducteur TEXT NOT NULL DEFAULT 'Interne',  -- Interne | Prestataire
  ADD COLUMN IF NOT EXISTS societe         TEXT;
