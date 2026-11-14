-- Module Achats — frais annexes sur le bon de commande (Lot 2). Instantané des frais du devis
-- retenu au moment de la génération du BC, pour un bon de commande auto-porteur (PDF + rapports)
-- indépendant d'une évolution ultérieure de la demande. Additif et idempotent.

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS montant_frais NUMERIC(18, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS purchase_order_fees (
  id                SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  fee_type_id       INTEGER REFERENCES quote_fee_types(id) ON DELETE SET NULL,
  libelle_fige      TEXT NOT NULL,
  montant           NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ordre             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_po_fees_po ON purchase_order_fees(purchase_order_id);
