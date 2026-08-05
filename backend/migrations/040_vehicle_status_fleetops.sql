-- Statuts véhicule alignés sur FleetOps : Disponible | En mission | Maintenance | Immobilisé |
-- Réformé. Remappe les anciennes valeurs (actif/immobilise/reforme) et change le défaut.
UPDATE vehicles SET statut = CASE statut
  WHEN 'actif'      THEN 'Disponible'
  WHEN 'immobilise' THEN 'Immobilisé'
  WHEN 'reforme'    THEN 'Réformé'
  ELSE statut
END
WHERE statut IN ('actif', 'immobilise', 'reforme');

ALTER TABLE vehicles ALTER COLUMN statut SET DEFAULT 'Disponible';
