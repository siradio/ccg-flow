-- Module QHSE — Lot 3. Deux processus Qualité :
--   A) Non-conformités / CAPA (diagramme IN-CQ06) : détection → fiche → évaluation du risque →
--      action immédiate → analyse des causes (5M) → actions correctives/préventives (CAPA) →
--      vérification d'efficacité → clôture. Gravités = référentiel qhse_nc_severities (Lot 0).
--   B) Libération des lots : décision Qualité (libéré / bloqué / rebut / dérogation) tracée et
--      appliquée transactionnellement sur stock_lots.statut_qualite (jamais automatique).
-- Tables additives / idempotentes.

-- ============================================================================================
-- A) Non-conformités / CAPA
-- ============================================================================================

CREATE TABLE IF NOT EXISTS qhse_nonconformities (
  id               SERIAL PRIMARY KEY,
  numero           TEXT,
  date_detection   DATE,
  detecteur        TEXT,
  source           TEXT,                        -- réception / production / labo / réclamation / audit (libre)
  severity_id      INTEGER REFERENCES qhse_nc_severities(id) ON DELETE SET NULL,
  business_unit_id INTEGER REFERENCES business_units(id) ON DELETE SET NULL,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  format_id        INTEGER REFERENCES qhse_formats(id) ON DELETE SET NULL,
  numero_lot       TEXT,
  sample_id        INTEGER REFERENCES qhse_samples(id) ON DELETE SET NULL,
  analysis_id      INTEGER REFERENCES qhse_analyses(id) ON DELETE SET NULL,
  stock_lot_id     INTEGER REFERENCES stock_lots(id) ON DELETE SET NULL,
  description      TEXT,
  risque           TEXT,                        -- évaluation du risque
  action_immediate TEXT,                        -- correction / confinement immédiat
  efficacite       TEXT,                        -- résultat de la vérification d'efficacité
  conclusion       TEXT,
  statut           TEXT NOT NULL DEFAULT 'ouverte',  -- ouverte | analyse | action | verification | cloturee
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qhse_nc_statut ON qhse_nonconformities(statut);
CREATE INDEX IF NOT EXISTS idx_qhse_nc_date ON qhse_nonconformities(date_detection);

-- Analyse des causes — méthode 5M (catégorie figée : matière/main d'œuvre/méthode/milieu/matériel).
CREATE TABLE IF NOT EXISTS qhse_nc_causes (
  id          SERIAL PRIMARY KEY,
  nc_id       INTEGER NOT NULL REFERENCES qhse_nonconformities(id) ON DELETE CASCADE,
  categorie   TEXT,                             -- matiere | main_oeuvre | methode | milieu | materiel | autre
  description TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qhse_nc_causes_nc ON qhse_nc_causes(nc_id);

-- Actions correctives / préventives (CAPA).
CREATE TABLE IF NOT EXISTS qhse_nc_actions (
  id               SERIAL PRIMARY KEY,
  nc_id            INTEGER NOT NULL REFERENCES qhse_nonconformities(id) ON DELETE CASCADE,
  type_action      TEXT,                        -- corrective | preventive
  description      TEXT,
  responsable      TEXT,
  echeance         DATE,
  statut           TEXT NOT NULL DEFAULT 'a_faire',  -- a_faire | en_cours | faite
  date_realisation DATE,
  ordre            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qhse_nc_actions_nc ON qhse_nc_actions(nc_id);

-- ============================================================================================
-- B) Libération des lots
-- ============================================================================================

-- Décision Qualité sur un lot (stock_lots). La décision met à jour stock_lots.statut_qualite dans
-- la même transaction (voir qhse.liberation.service.js). Historique conservé (une ligne par décision).
CREATE TABLE IF NOT EXISTS qhse_lot_releases (
  id               SERIAL PRIMARY KEY,
  stock_lot_id     INTEGER REFERENCES stock_lots(id) ON DELETE SET NULL,
  decision         TEXT NOT NULL,               -- libere | bloque | rebut | derogation
  statut_qualite_applique TEXT,                 -- valeur écrite dans stock_lots.statut_qualite
  motif            TEXT,
  decideur         TEXT,
  date_decision    DATE,
  nc_id            INTEGER REFERENCES qhse_nonconformities(id) ON DELETE SET NULL,
  analysis_id      INTEGER REFERENCES qhse_analyses(id) ON DELETE SET NULL,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_lot_releases_lot ON qhse_lot_releases(stock_lot_id);
