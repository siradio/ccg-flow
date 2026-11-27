-- RH — demande d'annulation d'une demande VALIDÉE (ex. congé déjà validé par tous). Le demandeur
-- dépose une demande d'annulation avec motif (à tout moment) ; la RH valide ou refuse ; le manager
-- est notifié. À l'acceptation, la demande passe en « annulée » (le solde de congé se recrédite
-- automatiquement, puisqu'il ne compte que les congés au statut « validée »). Migration additive.
ALTER TABLE rh_requests ADD COLUMN IF NOT EXISTS annulation_demandee BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rh_requests ADD COLUMN IF NOT EXISTS annulation_motif     TEXT;
ALTER TABLE rh_requests ADD COLUMN IF NOT EXISTS annulation_by        INTEGER REFERENCES users(id);
ALTER TABLE rh_requests ADD COLUMN IF NOT EXISTS annulation_at        TIMESTAMPTZ;
