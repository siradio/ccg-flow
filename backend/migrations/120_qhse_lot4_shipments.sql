-- Module QHSE — Lot 4. Contrôle des expéditions / livraisons (ENR-CQ03) : contrôle qualité au
-- chargement / à la livraison (température, propreté du véhicule, état des emballages, conformité
-- des quantités, documents, dates). Critères paramétrables (même logique que les contrôles de
-- production : type booléen / numérique + seuils facultatifs, rien d'inventé).
-- Le tableau de bord (Lot 4) ne crée aucune table : il agrège l'existant.
-- Tables additives / idempotentes.

-- Critères de contrôle expédition (référentiel).
CREATE TABLE IF NOT EXISTS qhse_shipment_criteria (
  id           SERIAL PRIMARY KEY,
  code         TEXT,
  libelle      TEXT NOT NULL,
  type_critere TEXT NOT NULL DEFAULT 'booleen',   -- 'booleen' | 'numerique'
  unite        TEXT,
  seuil_min    NUMERIC,
  seuil_max    NUMERIC,
  ordre        INTEGER NOT NULL DEFAULT 0,
  actif        BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO qhse_shipment_criteria (code, libelle, type_critere, unite, ordre) VALUES
  ('temperature',   'Température',                 'numerique', '°C', 1),
  ('proprete',      'Propreté du véhicule',        'booleen',   NULL, 2),
  ('emballage',     'État des emballages',         'booleen',   NULL, 3),
  ('quantite',      'Conformité des quantités',    'booleen',   NULL, 4),
  ('documents',     'Documents (bon de livraison)','booleen',   NULL, 5),
  ('dates',         'Dates / DLC conformes',       'booleen',   NULL, 6)
ON CONFLICT DO NOTHING;

-- En-tête d'un contrôle d'expédition.
CREATE TABLE IF NOT EXISTS qhse_shipment_controls (
  id               SERIAL PRIMARY KEY,
  numero           TEXT,
  date_controle    DATE,
  business_unit_id INTEGER REFERENCES business_units(id) ON DELETE SET NULL,
  destination      TEXT,                        -- client / lieu de livraison (libre)
  transporteur     TEXT,
  vehicule         TEXT,                        -- immatriculation / identifiant
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  numero_lot       TEXT,
  responsable      TEXT,
  statut           TEXT NOT NULL DEFAULT 'brouillon',   -- 'brouillon' | 'cloture'
  conformite       TEXT,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_ship_ctrl_date ON qhse_shipment_controls(date_controle);

-- Points de contrôle (un par critère).
CREATE TABLE IF NOT EXISTS qhse_shipment_checks (
  id          SERIAL PRIMARY KEY,
  control_id  INTEGER NOT NULL REFERENCES qhse_shipment_controls(id) ON DELETE CASCADE,
  criteria_id INTEGER REFERENCES qhse_shipment_criteria(id) ON DELETE SET NULL,
  valeur_num  NUMERIC,
  valeur_bool BOOLEAN,
  conforme    TEXT,
  observation TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qhse_ship_check_ctrl ON qhse_shipment_checks(control_id);
