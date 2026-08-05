-- Refonte Stock (Lot 1) — Grand livre de mouvements (source de vérité, Décision A).
-- NB : tables nommées stock_ledger / stock_ledger_lines pour ne PAS entrer en collision avec
-- l'ancienne table stock_movements (migration 010), conservée en lecture seule le temps de la
-- migration. En-tête + lignes : un mouvement peut porter plusieurs produits (réception, transfert…).
-- L'utilisateur saisit une quantité TOUJOURS positive ; le sens du type porte le signe.
-- Le solde ne se stocke pas : il se DÉRIVE via la vue v_stock_balances.
CREATE TABLE IF NOT EXISTS stock_ledger (
  id                 SERIAL PRIMARY KEY,
  reference          TEXT UNIQUE,
  date_mouvement     DATE NOT NULL DEFAULT CURRENT_DATE,
  type_id            INTEGER NOT NULL REFERENCES stock_movement_types(id),
  business_unit_id   INTEGER REFERENCES business_units(id),
  location_id        INTEGER REFERENCES stock_locations(id),        -- localisation (source)
  location_dest_id   INTEGER REFERENCES stock_locations(id),        -- destination (transfert, Lot 3)
  statut             TEXT NOT NULL DEFAULT 'valide' CHECK (statut IN ('brouillon','soumis','a_valider','valide','refuse','annule','contrepasse')),
  reference_document TEXT,
  numero_bon         TEXT,
  fournisseur_id     INTEGER REFERENCES suppliers(id),
  commentaire        TEXT,
  contrepasse_de     INTEGER REFERENCES stock_ledger(id),           -- mouvement d'origine si contrepassation
  created_by         INTEGER NOT NULL REFERENCES users(id),
  validated_by       INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_ledger_lines (
  id             SERIAL PRIMARY KEY,
  movement_id    INTEGER NOT NULL REFERENCES stock_ledger(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id),
  quantite       NUMERIC(16, 3) NOT NULL CHECK (quantite > 0),
  lot_id         INTEGER,                                            -- FK stock_lots (Lot 2)
  prix_unitaire  NUMERIC(16, 4),
  valeur         NUMERIC(18, 2)
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_bu    ON stock_ledger(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_type  ON stock_ledger(type_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_date  ON stock_ledger(date_mouvement DESC);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_lines_mvt  ON stock_ledger_lines(movement_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_lines_prod ON stock_ledger_lines(product_id);

-- Solde dérivé par (produit × localisation) : Σ entrées − Σ sorties sur les mouvements validés.
-- Les types 'neutre' (contrôle qualité, transfert brut) n'impactent pas le solde ici.
CREATE OR REPLACE VIEW v_stock_balances AS
SELECT
  ml.product_id,
  m.location_id,
  SUM(CASE t.sens WHEN 'entree' THEN ml.quantite WHEN 'sortie' THEN -ml.quantite ELSE 0 END) AS stock_actuel,
  SUM(CASE t.sens WHEN 'entree' THEN ml.quantite ELSE 0 END)                                  AS total_entrees,
  SUM(CASE t.sens WHEN 'sortie' THEN ml.quantite ELSE 0 END)                                  AS total_sorties,
  SUM(CASE t.sens WHEN 'entree' THEN COALESCE(ml.valeur, 0)
                  WHEN 'sortie' THEN -COALESCE(ml.valeur, 0) ELSE 0 END)                       AS valeur_flux
FROM stock_ledger_lines ml
JOIN stock_ledger m          ON m.id = ml.movement_id
JOIN stock_movement_types t  ON t.id = m.type_id
WHERE m.statut = 'valide'
GROUP BY ml.product_id, m.location_id;
