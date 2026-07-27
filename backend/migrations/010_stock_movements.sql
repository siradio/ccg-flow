-- Mouvement Stock (base posée, module non finalisé — voir SPEC.md §3.9) : journal des mouvements
-- individuels (réceptions, sorties, ajustements), distinct de stock_entries qui est un RELEVÉ
-- quotidien (upsert par jour). Ici, comme product_prices, chaque ligne est un ÉVÉNEMENT daté,
-- jamais écrasé — append-only.
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  type_mouvement TEXT NOT NULL CHECK (type_mouvement IN ('entree', 'sortie')),
  quantite NUMERIC(14, 2) NOT NULL CHECK (quantite > 0),
  date_mouvement DATE NOT NULL,
  motif TEXT,
  reference_document TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date ON stock_movements(product_id, date_mouvement);
