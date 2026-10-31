-- Module Logistique — Gestion du CARBURANT (pleins en station externe, saisie par le gestionnaire).
-- Objectifs : détection de fraude, rapport de consommation, dashboard. La consommation est calculée
-- « plein à plein » (litres entre deux pleins complets ÷ distance × 100). La conso de référence du
-- véhicule (L/100 km) sert de base anti-fraude ; capacite_reservoir (migration 065) sert de plafond
-- de volume (on ne peut pas mettre plus que ce que le réservoir contient).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS type_carburant        TEXT;              -- gasoil | essence
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS conso_reference_l_100 NUMERIC(6, 2);     -- L/100 km attendue

CREATE TABLE IF NOT EXISTS vehicle_fuel_entries (
  id              SERIAL PRIMARY KEY,
  date_plein      DATE NOT NULL,
  vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id       INTEGER REFERENCES drivers(id) ON DELETE SET NULL,   -- chauffeur ayant fait le plein
  compteur_km     INTEGER,                                             -- relevé compteur au plein
  litres          NUMERIC(10, 2) NOT NULL CHECK (litres > 0),
  prix_unitaire   NUMERIC(12, 2),                                      -- prix au litre (GNF)
  montant         NUMERIC(14, 2),                                      -- coût total du plein (GNF)
  plein_complet   BOOLEAN NOT NULL DEFAULT true,                       -- réservoir rempli à ras bord
  station         TEXT,
  mode_paiement   TEXT,                                                -- especes | carte | bon
  reference       TEXT,                                                -- n° bon / carte / ticket
  commentaire     TEXT,
  -- Workflow de traitement d'une anomalie détectée : ras → a_verifier → justifie / fraude.
  statut_anomalie TEXT NOT NULL DEFAULT 'ras' CHECK (statut_anomalie IN ('ras', 'a_verifier', 'justifie', 'fraude')),
  anomalie_note   TEXT,
  anomalie_par    INTEGER REFERENCES users(id),
  anomalie_le     TIMESTAMPTZ,
  created_by      INTEGER REFERENCES users(id),
  updated_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fuel_vehicle_km   ON vehicle_fuel_entries(vehicle_id, compteur_km);
CREATE INDEX IF NOT EXISTS idx_fuel_vehicle_date ON vehicle_fuel_entries(vehicle_id, date_plein);
