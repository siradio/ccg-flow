-- Refonte Stock (Lot 2) — Lots & péremption. Un lot = un numéro pour un produit, avec dates de
-- fabrication / réception / péremption. La quantité restante d'un lot se DÉRIVE des lignes de
-- mouvement rattachées (comme le solde global). FEFO = First Expired First Out : à la sortie, on
-- propose d'abord les lots dont la péremption est la plus proche.
CREATE TABLE IF NOT EXISTS stock_lots (
  id                SERIAL PRIMARY KEY,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  numero_lot        TEXT NOT NULL,
  date_fabrication  DATE,
  date_reception    DATE,
  date_peremption   DATE,
  quantite_initiale NUMERIC(16, 3),
  fournisseur_id    INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  location_id       INTEGER REFERENCES stock_locations(id) ON DELETE SET NULL,
  statut_qualite    TEXT,
  commentaire       TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, numero_lot)
);
CREATE INDEX IF NOT EXISTS idx_stock_lots_product   ON stock_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_lots_peremption ON stock_lots(date_peremption);

-- Relie les lignes de mouvement au lot (colonne lot_id déjà créée en 048, FK ajoutée ici).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_ledger_lines_lot_fk') THEN
    ALTER TABLE stock_ledger_lines
      ADD CONSTRAINT stock_ledger_lines_lot_fk FOREIGN KEY (lot_id) REFERENCES stock_lots(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Quantité restante par lot = Σ entrées − Σ sorties des lignes rattachées à ce lot (mvts validés).
CREATE OR REPLACE VIEW v_stock_lot_balances AS
SELECT ml.lot_id,
  SUM(CASE t.sens WHEN 'entree' THEN ml.quantite WHEN 'sortie' THEN -ml.quantite ELSE 0 END) AS quantite_restante
FROM stock_ledger_lines ml
JOIN stock_ledger m         ON m.id = ml.movement_id
JOIN stock_movement_types t ON t.id = m.type_id
WHERE m.statut = 'valide' AND ml.lot_id IS NOT NULL
GROUP BY ml.lot_id;
