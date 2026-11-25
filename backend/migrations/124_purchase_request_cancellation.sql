-- Demandes d'achat — annulation par le demandeur.
--  • En brouillon : l'auteur annule directement (statut terminal 'annulee').
--  • Déjà dans le circuit : l'auteur dépose une DEMANDE d'annulation avec motif ; le validateur qui a
--    la DA à son niveau (ou un super_admin) l'accepte (→ 'annulee') ou la refuse (le circuit continue).
-- La demande d'annulation est un drapeau posé SUR la demande, sans changer son statut tant qu'elle
-- n'est pas tranchée (le circuit reste intact). Migration additive & idempotente.

-- 1) Nouveau statut terminal 'annulee' (on reprend la liste de 066 + 'annulee').
ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check CHECK (status IN (
  'brouillon', 'en_attente_validation_besoin', 'soumise', 'en_analyse_achat', 'devis_en_cours',
  'devis_selectionne', 'en_validation', 'en_validation_dga', 'validee', 'rejetee',
  'bon_commande_genere', 'annulee'
));

-- 2) Drapeau « demande d'annulation en attente » + traçabilité (qui / quand / pourquoi).
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS annulation_demandee BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS annulation_motif    TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS annulation_by       INTEGER REFERENCES users(id);
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS annulation_at       TIMESTAMPTZ;
