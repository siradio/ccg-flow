-- Module Logistique — Conducteurs. Un chauffeur peut être un EMPLOYÉ (employee_id renseigné, le cas
-- le plus courant) OU un intérimaire / externe saisi directement (employee_id NULL, nom/prénom + permis
-- saisis à la main). Le nom est toujours stocké sur la fiche conducteur pour rester lisible partout
-- sans dépendre du lien RH.
CREATE TABLE IF NOT EXISTS drivers (
  id                SERIAL PRIMARY KEY,
  employee_id       INTEGER REFERENCES employees(id) ON DELETE SET NULL,  -- lien RH si interne (nullable)
  nom               TEXT NOT NULL,
  prenom            TEXT,
  telephone         TEXT,
  permis_numero     TEXT,
  permis_categories TEXT,                                                 -- ex. « B, C, CE »
  permis_validite   DATE,
  actif             BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drivers_employee ON drivers(employee_id);
