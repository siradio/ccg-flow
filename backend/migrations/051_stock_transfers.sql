-- Refonte Stock (Lot 3) — Transferts de stock avec double validation (départ / arrivée).
-- Un transfert génère, à l'expédition, un mouvement de sortie sur la localisation source, et à la
-- réception, un mouvement d'entrée sur la localisation destination (via le grand livre → le solde
-- par localisation reste exact). Écart = quantité expédiée − quantité reçue.
CREATE TABLE IF NOT EXISTS stock_transfers (
  id                     SERIAL PRIMARY KEY,
  reference              TEXT UNIQUE,
  date_transfert         DATE NOT NULL DEFAULT CURRENT_DATE,
  business_unit_source   INTEGER REFERENCES business_units(id),
  business_unit_dest     INTEGER REFERENCES business_units(id),
  location_source_id     INTEGER REFERENCES stock_locations(id),
  location_dest_id       INTEGER REFERENCES stock_locations(id),
  statut                 TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','expedie','recu','annule')),
  transporteur           TEXT,
  vehicule               TEXT,
  chauffeur              TEXT,
  commentaire            TEXT,
  created_by             INTEGER NOT NULL REFERENCES users(id),
  expedie_by             INTEGER REFERENCES users(id),
  expedie_le             TIMESTAMPTZ,
  recu_by                INTEGER REFERENCES users(id),
  recu_le                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id                  SERIAL PRIMARY KEY,
  transfer_id         INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id          INTEGER NOT NULL REFERENCES products(id),
  lot_id              INTEGER REFERENCES stock_lots(id) ON DELETE SET NULL,
  quantite_demandee   NUMERIC(16,3) NOT NULL CHECK (quantite_demandee > 0),
  quantite_expediee   NUMERIC(16,3),
  quantite_recue      NUMERIC(16,3)
);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_transfer ON stock_transfer_lines(transfer_id);

-- Lien mouvement ↔ transfert (traçabilité des sorties/entrées générées).
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS transfer_id INTEGER REFERENCES stock_transfers(id) ON DELETE SET NULL;

-- Types de mouvement dédiés au transfert (impact réel sur le solde par localisation).
INSERT INTO stock_movement_types (code, libelle, sens, ordre) VALUES
  ('transfert_sortie', 'Transfert (sortie)', 'sortie', 63),
  ('transfert_entree', 'Transfert (entrée)', 'entree', 64)
ON CONFLICT (code) DO NOTHING;
