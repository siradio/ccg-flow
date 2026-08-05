-- Refonte Stock (Lot 4 — saisie matières premières) — Champs de production sur le grand livre.
-- Renseignés surtout lors d'une consommation de matière première rattachée à un ordre de fabrication.
-- Tous nullables : sans impact sur les mouvements produits finis.
ALTER TABLE stock_ledger
  ADD COLUMN IF NOT EXISTS ordre_fabrication TEXT,
  ADD COLUMN IF NOT EXISTS ligne_production  TEXT,
  ADD COLUMN IF NOT EXISTS produit_fini_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lot_fournisseur   TEXT,
  ADD COLUMN IF NOT EXISTS statut_qualite    TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_ledger_of ON stock_ledger(ordre_fabrication);
