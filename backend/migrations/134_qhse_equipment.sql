-- Module QHSE — Volet Qualité, domaine QUA-10 : équipements de mesure et laboratoire.
-- Inventaire + vérifications / étalonnages / maintenance, avec échéances. Migration additive.
CREATE TABLE IF NOT EXISTS qhse_equipment (
  id               SERIAL PRIMARY KEY,
  code             TEXT,
  libelle          TEXT NOT NULL,
  type             TEXT,                                    -- balance, pH-mètre, étuve, thermomètre…
  localisation     TEXT,
  business_unit_id INTEGER REFERENCES business_units(id),
  criticite        TEXT CHECK (criticite IN ('critique', 'normale') OR criticite IS NULL),
  frequence_mois   INTEGER,                                 -- périodicité de vérification (mois)
  derniere_verif   DATE,
  prochaine_verif  DATE,
  statut           TEXT NOT NULL DEFAULT 'en_service' CHECK (statut IN ('en_service', 'hors_service', 'reforme')),
  commentaire      TEXT,
  actif            BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_equipment_prochaine ON qhse_equipment (prochaine_verif);

-- Journal des vérifications / étalonnages / maintenances d'un équipement.
CREATE TABLE IF NOT EXISTS qhse_equipment_verifications (
  id                 SERIAL PRIMARY KEY,
  equipment_id       INTEGER NOT NULL REFERENCES qhse_equipment(id) ON DELETE CASCADE,
  date_verif         DATE,
  type_verif         TEXT,                                  -- etalonnage / verification / maintenance
  resultat           TEXT,                                  -- conforme / non_conforme / na
  prochaine_echeance DATE,
  operateur          TEXT,
  organisme          TEXT,
  commentaire        TEXT,
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_equip_verif ON qhse_equipment_verifications (equipment_id, date_verif DESC);
