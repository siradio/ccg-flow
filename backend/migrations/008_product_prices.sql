-- Historique des prix par produit (module `prix`). Contrairement à stock_entries (relevé du
-- jour, corrigible par upsert), chaque ligne ici est un CHANGEMENT DE PRIX daté : on n'écrase
-- jamais une ligne existante, on en ajoute une nouvelle — c'est un vrai journal d'audit, pas un
-- instantané. La Business Unit du prix est toujours celle du produit (products.business_unit_id),
-- jamais dupliquée ici, même raisonnement que pour stock_entries.
CREATE TABLE IF NOT EXISTS product_prices (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  prix NUMERIC(14,2) NOT NULL,
  devise TEXT NOT NULL DEFAULT 'GNF' CHECK (devise IN ('GNF', 'USD', 'EUR')),
  date_effet DATE NOT NULL,
  commentaire TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_prices_product_date ON product_prices(product_id, date_effet);
