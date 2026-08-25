-- Module Commerce — Phase G : objectifs commerciaux (par mois × commercial × BU, produit optionnel).
-- Le réalisé, l'objectif journalier, le taux, la projection sont CALCULÉS (non stockés) à partir
-- des versements validés et du nombre de jours du mois.

CREATE TABLE IF NOT EXISTS commercial_objectifs (
  id               SERIAL PRIMARY KEY,
  periode          DATE NOT NULL,               -- 1er jour du mois concerné
  commercial_id    INTEGER NOT NULL REFERENCES commerciaux(id) ON DELETE CASCADE,
  business_unit_id INTEGER REFERENCES business_units(id),
  product_id       INTEGER REFERENCES products(id),
  objectif_montant NUMERIC(16,2) NOT NULL DEFAULT 0,
  commentaire      TEXT,
  actif            BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       INTEGER REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_obj_periode    ON commercial_objectifs(periode);
CREATE INDEX IF NOT EXISTS idx_obj_commercial ON commercial_objectifs(commercial_id);

-- Un objectif « global commercial » (sans produit) unique par (mois, commercial) ; les objectifs
-- par produit (product_id renseigné) sont uniques par (mois, commercial, produit).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_obj_commercial_period
  ON commercial_objectifs (periode, commercial_id) WHERE product_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_obj_commercial_period_product
  ON commercial_objectifs (periode, commercial_id, product_id) WHERE product_id IS NOT NULL;
