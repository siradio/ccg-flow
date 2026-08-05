-- Module Logistique — Cartographie / suivi GPS. Modèle de positions normalisé, alimenté aujourd'hui
-- manuellement (source 'manuel') et demain par le prestataire télématique SAT Guinée (source 'sat')
-- via POST /api/positions — le schéma ne change pas selon la source. La carte lit la dernière
-- position par véhicule (DISTINCT ON) ; l'historique permettra de tracer les trajets de mission.
CREATE TABLE IF NOT EXISTS vehicle_positions (
  id          BIGSERIAL PRIMARY KEY,
  vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  speed       DOUBLE PRECISION,          -- km/h
  heading     DOUBLE PRECISION,          -- cap 0-360°
  ignition    BOOLEAN,                   -- contact moteur
  odometer    DOUBLE PRECISION,          -- km au compteur
  source      TEXT NOT NULL DEFAULT 'manuel',  -- manuel | sat
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle_time
  ON vehicle_positions(vehicle_id, recorded_at DESC);
