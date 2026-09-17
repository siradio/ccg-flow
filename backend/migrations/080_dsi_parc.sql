-- ============================================================================
-- Module DSI — L1 : Parc informatique (inventaire) + Affectations. Additif.
-- Réutilise entities/sites/business_units/suppliers/employees/users.
-- ============================================================================

CREATE TABLE IF NOT EXISTS dsi_equipment (
  id                 SERIAL PRIMARY KEY,
  numero_inventaire  TEXT NOT NULL UNIQUE,
  category_id        INTEGER REFERENCES dsi_categories(id),
  type_id            INTEGER REFERENCES dsi_types(id),
  designation        TEXT NOT NULL,
  brand_id           INTEGER REFERENCES dsi_brands(id),
  modele             TEXT,
  num_serie          TEXT,
  entity_id          INTEGER REFERENCES entities(id),
  site_id            INTEGER REFERENCES sites(id),
  localisation       TEXT,
  supplier_id        INTEGER REFERENCES suppliers(id),
  date_achat         DATE,
  prix_achat         NUMERIC(14,2),
  date_mise_service  DATE,
  fin_garantie       DATE,
  etat               TEXT,               -- état physique (neuf/bon/moyen/mauvais…) — libre
  statut             TEXT NOT NULL DEFAULT 'en_stock'
                     CHECK (statut IN ('disponible','affecte','en_stock','en_maintenance','en_panne','reforme','perdu','vole')),
  commentaire        TEXT,
  deleted_at         TIMESTAMPTZ,        -- suppression logique (historique conservé)
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dsi_equipment_category ON dsi_equipment(category_id);
CREATE INDEX IF NOT EXISTS idx_dsi_equipment_type     ON dsi_equipment(type_id);
CREATE INDEX IF NOT EXISTS idx_dsi_equipment_brand    ON dsi_equipment(brand_id);
CREATE INDEX IF NOT EXISTS idx_dsi_equipment_entity   ON dsi_equipment(entity_id);
CREATE INDEX IF NOT EXISTS idx_dsi_equipment_site     ON dsi_equipment(site_id);
CREATE INDEX IF NOT EXISTS idx_dsi_equipment_statut   ON dsi_equipment(statut);
CREATE INDEX IF NOT EXISTS idx_dsi_equipment_deleted  ON dsi_equipment(deleted_at);
CREATE INDEX IF NOT EXISTS idx_dsi_equipment_garantie ON dsi_equipment(fin_garantie);

CREATE TABLE IF NOT EXISTS dsi_assignments (
  id                    SERIAL PRIMARY KEY,
  equipment_id          INTEGER NOT NULL REFERENCES dsi_equipment(id),
  beneficiaire_type     TEXT NOT NULL CHECK (beneficiaire_type IN ('employe','service','filiale','site')),
  employee_id           INTEGER REFERENCES employees(id),
  business_unit_id      INTEGER REFERENCES business_units(id),
  entity_id             INTEGER REFERENCES entities(id),
  site_id               INTEGER REFERENCES sites(id),
  date_affectation      DATE NOT NULL DEFAULT CURRENT_DATE,
  affecte_par           INTEGER REFERENCES users(id),
  etat_remise           TEXT,
  accessoires_remis     TEXT,
  retour_prevu          DATE,
  statut                TEXT NOT NULL DEFAULT 'active' CHECK (statut IN ('active','cloturee')),
  motif_cloture         TEXT,               -- transfert / restitution / réaffectation
  date_restitution      DATE,
  etat_restitution      TEXT,
  accessoires_restitues TEXT,
  anomalies             TEXT,
  commentaire           TEXT,
  closed_by             INTEGER REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dsi_assign_equipment ON dsi_assignments(equipment_id);
CREATE INDEX IF NOT EXISTS idx_dsi_assign_employee  ON dsi_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_dsi_assign_statut    ON dsi_assignments(statut);
-- Une seule affectation ACTIVE par équipement (garantie base, en plus de la logique applicative).
CREATE UNIQUE INDEX IF NOT EXISTS uq_dsi_assign_active
  ON dsi_assignments(equipment_id) WHERE statut = 'active';
