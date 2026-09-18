-- ============================================================================
-- RH — routage de la 1re validation vers le RESPONSABLE HIÉRARCHIQUE DIRECT du
-- demandeur (et non n'importe quel détenteur du rôle « responsable »). On stocke
-- le validateur attendu de l'étape courante (utilisé pour l'étape responsable ;
-- NULL pour les étapes par rôle rh/daf/dg). Additif.
-- ============================================================================
ALTER TABLE rh_requests ADD COLUMN IF NOT EXISTS validateur_user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_rh_requests_validateur ON rh_requests(validateur_user_id);
