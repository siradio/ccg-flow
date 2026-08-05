-- Module Production — relevé de production journalière. La production est un FLUX : une quantité
-- produite par produit et par jour (cumulable sur une période, contrairement au stock qui est un
-- niveau). Premier socle du module ; la planification, les ordres de fabrication, etc. viendront
-- s'ajouter ensuite. La BU est dérivée du produit (products.business_unit_id), non dupliquée.
CREATE TABLE IF NOT EXISTS production_entries (
  id               SERIAL PRIMARY KEY,
  date_production  DATE NOT NULL,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantite         NUMERIC(16, 3) NOT NULL CHECK (quantite >= 0),
  commentaire      TEXT,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  updated_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date_production, product_id)
);
CREATE INDEX IF NOT EXISTS idx_production_entries_date    ON production_entries(date_production);
CREATE INDEX IF NOT EXISTS idx_production_entries_product ON production_entries(product_id);
