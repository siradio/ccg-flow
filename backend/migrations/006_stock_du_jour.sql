-- Module "Stock du Jour" : saisie quotidienne du niveau de stock des produits finis,
-- par Business Unit, avec historique et alertes de seuil bas.

-- Seuil configurable par produit (KPI "stock faible" / alertes du dashboard DG).
ALTER TABLE products ADD COLUMN IF NOT EXISTS seuil_alerte_stock NUMERIC(14, 2);

-- Accès explicite par Business Unit pour le "Gestionnaire de Stock" — indépendant du module
-- 'stock' (qui donne juste la visibilité du menu Stock du Jour). Un utilisateur peut couvrir
-- plusieurs BU. Sans octroi ici, l'accès reste en lecture seule sur toutes les BU (cf.
-- stock.service.js : canWriteBu / visibleBuIds).
CREATE TABLE IF NOT EXISTS user_business_unit_access (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_unit_id  INTEGER NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_unit_id)
);
CREATE INDEX IF NOT EXISTS idx_user_bu_access_user ON user_business_unit_access(user_id);

-- Une ligne par (date, produit) — jamais dupliquée, une nouvelle saisie le même jour sur le
-- même produit MET À JOUR la ligne existante (cf. contrainte unique + upsert applicatif).
-- La Business Unit n'est volontairement PAS redondante ici : elle est toujours dérivée de
-- products.business_unit_id (source unique de vérité), pour ne jamais désynchroniser les deux.
-- Un produit sans business_unit_id ne peut donc pas avoir de saisie de stock quotidien
-- (contrôle applicatif, voir stock.service.js).
CREATE TABLE IF NOT EXISTS stock_entries (
  id            SERIAL PRIMARY KEY,
  date_stock    DATE NOT NULL,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  quantite      NUMERIC(14, 2) NOT NULL,
  unite         TEXT,
  commentaire   TEXT,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  updated_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date_stock, product_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_entries_date ON stock_entries(date_stock);
CREATE INDEX IF NOT EXISTS idx_stock_entries_product ON stock_entries(product_id);
