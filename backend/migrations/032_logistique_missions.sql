-- Module Logistique — Missions (déplacements). Une mission associe un véhicule, un chauffeur et,
-- en général, un commercial accompagnateur (facultatif, un employé au poste « Commercial »). Le
-- reste (km, dates, statut) suit le déroulé du déplacement. Le chauffeur référence la fiche
-- conducteur ; le commercial référence directement l'employé RH.
CREATE TABLE IF NOT EXISTS missions (
  id                      SERIAL PRIMARY KEY,
  objet                   TEXT NOT NULL,
  vehicle_id              INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id               INTEGER NOT NULL REFERENCES drivers(id)  ON DELETE RESTRICT,
  commercial_employee_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,  -- accompagnateur (facultatif)
  depart                  TEXT,
  arrivee                 TEXT,
  date_debut              DATE,
  date_fin                DATE,
  km_depart               INTEGER,
  km_retour               INTEGER,
  statut                  TEXT NOT NULL DEFAULT 'Planifiée',  -- Planifiée | En cours | Terminée | Annulée
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_vehicle ON missions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_missions_driver  ON missions(driver_id);
