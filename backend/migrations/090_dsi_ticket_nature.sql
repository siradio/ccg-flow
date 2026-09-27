-- Nature d'un ticket DSI : « incident » (dysfonctionnement) ou « demande » (demande de service).
-- Permet de distinguer les deux dans les statistiques. Les tickets existants sont des incidents.
ALTER TABLE dsi_tickets ADD COLUMN IF NOT EXISTS nature TEXT NOT NULL DEFAULT 'incident';
CREATE INDEX IF NOT EXISTS idx_dsi_tickets_nature ON dsi_tickets(nature);
