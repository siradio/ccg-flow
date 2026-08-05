-- Refonte Stock (Lot 3) — Inventaires physiques. Une campagne fige le stock théorique à sa création,
-- l'utilisateur saisit le stock physique, l'écart est calculé, puis la validation génère
-- automatiquement des mouvements d'ajustement (positif / négatif) pour aligner le grand livre.
CREATE TABLE IF NOT EXISTS stock_inventories (
  id                SERIAL PRIMARY KEY,
  reference         TEXT UNIQUE,
  date_inventaire   DATE NOT NULL DEFAULT CURRENT_DATE,
  business_unit_id  INTEGER REFERENCES business_units(id),
  location_id       INTEGER REFERENCES stock_locations(id),
  statut            TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours','valide','annule')),
  commentaire       TEXT,
  created_by        INTEGER NOT NULL REFERENCES users(id),
  validated_by      INTEGER REFERENCES users(id),
  validated_le      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_inventory_lines (
  id                SERIAL PRIMARY KEY,
  inventory_id      INTEGER NOT NULL REFERENCES stock_inventories(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  lot_id            INTEGER REFERENCES stock_lots(id) ON DELETE SET NULL,
  stock_theorique   NUMERIC(16,3) NOT NULL DEFAULT 0,
  stock_physique    NUMERIC(16,3),
  motif             TEXT
);
CREATE INDEX IF NOT EXISTS idx_stock_inventory_lines_inv ON stock_inventory_lines(inventory_id);

-- Lien mouvement ↔ inventaire (les ajustements générés à la validation).
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS inventory_id INTEGER REFERENCES stock_inventories(id) ON DELETE SET NULL;
