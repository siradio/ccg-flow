-- Module Logistique — Réparations : une panne est envoyée en réparation chez un garage. Ouvrir une
-- réparation met la panne « En réparation » et le véhicule « Maintenance » ; la clôturer repasse la
-- panne « Réparée » et le véhicule « Disponible » (voir reparations.routes.js).
CREATE TABLE IF NOT EXISTS reparations (
  id         SERIAL PRIMARY KEY,
  panne_id   INTEGER REFERENCES pannes(id) ON DELETE CASCADE,
  garage_id  INTEGER REFERENCES garages(id) ON DELETE SET NULL,
  cout       NUMERIC(14, 2),
  date_debut TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_fin   TIMESTAMPTZ,
  statut     TEXT NOT NULL DEFAULT 'En cours',   -- En cours | Clôturée
  notes      TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reparations_panne ON reparations(panne_id);
CREATE INDEX IF NOT EXISTS idx_reparations_garage ON reparations(garage_id);
