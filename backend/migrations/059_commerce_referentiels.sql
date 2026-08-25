-- Module Commerce — Phase D : référentiels & affectations.
-- Réutilise les référentiels existants (business_units, products, employees, entities,
-- sites, users, attachments) — AUCUN doublon. Ne crée que ce qui manque.
-- Additif et idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- 1) Moyens de versement — paramétrable, jamais codé en dur (frontend/règles métier).
CREATE TABLE IF NOT EXISTS payment_methods (
  id                    SERIAL PRIMARY KEY,
  code                  TEXT NOT NULL UNIQUE,
  libelle               TEXT NOT NULL,
  description           TEXT,
  requiert_reference    BOOLEAN NOT NULL DEFAULT false,
  requiert_justificatif BOOLEAN NOT NULL DEFAULT false,
  ordre                 INTEGER NOT NULL DEFAULT 0,
  actif                 BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO payment_methods (code, libelle, ordre, requiert_reference, requiert_justificatif) VALUES
  ('especes',      'Espèces',        1, false, false),
  ('orange_money', 'Orange Money',   2, false, false),
  ('banque',       'Banque',         3, true,  true),
  ('credit',       'Crédit',         4, false, false),
  ('autres_ecart', 'Autres / Écart', 5, false, false)
ON CONFLICT (code) DO NOTHING;

-- 2) Banques — référentiel minimal (n'existait pas).
CREATE TABLE IF NOT EXISTS banks (
  id    SERIAL PRIMARY KEY,
  code  TEXT NOT NULL UNIQUE,
  nom   TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true
);

-- 3) Zones commerciales — référentiel minimal (n'existait pas).
CREATE TABLE IF NOT EXISTS zones_commerciales (
  id    SERIAL PRIMARY KEY,
  code  TEXT NOT NULL UNIQUE,
  nom   TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true
);

-- 4) Commerciaux — interne = référence un employé existant (identité lue depuis employees) ;
--    externe = renseigne ses propres coordonnées. Rattachable plus tard à un employé.
CREATE TABLE IF NOT EXISTS commerciaux (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL DEFAULT 'interne' CHECK (type IN ('interne','externe')),
  employee_id      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  -- Coordonnées propres (commercial externe). Pour un interne, ces champs restent vides :
  -- l'identité provient du référentiel Employés.
  nom              TEXT,
  prenom           TEXT,
  telephone        TEXT,
  email            TEXT,
  adresse          TEXT,
  business_unit_id INTEGER REFERENCES business_units(id),
  zone_id          INTEGER REFERENCES zones_commerciales(id),
  responsable      TEXT,
  date_debut       DATE,
  statut           TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','inactif')),
  observations     TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       INTEGER REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commerciaux_bu       ON commerciaux(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_commerciaux_employee ON commerciaux(employee_id);

-- 5) Affectations commerciales — historisé (un commercial peut couvrir plusieurs produits).
--    Ne jamais recalculer les transactions passées selon l'affectation actuelle.
CREATE TABLE IF NOT EXISTS commercial_assignments (
  id               SERIAL PRIMARY KEY,
  commercial_id    INTEGER NOT NULL REFERENCES commerciaux(id) ON DELETE CASCADE,
  business_unit_id INTEGER NOT NULL REFERENCES business_units(id),
  product_id       INTEGER REFERENCES products(id),
  zone_id          INTEGER REFERENCES zones_commerciales(id),
  date_debut       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_fin         DATE,
  actif            BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assign_commercial ON commercial_assignments(commercial_id);
CREATE INDEX IF NOT EXISTS idx_assign_bu         ON commercial_assignments(business_unit_id);

-- 6) Paramètres Commerce — clé/valeur, global (business_unit_id NULL) ou par BU.
--    Sert au workflow optionnel et aux seuils (exploités en Phase F).
CREATE TABLE IF NOT EXISTS commerce_settings (
  id               SERIAL PRIMARY KEY,
  business_unit_id INTEGER REFERENCES business_units(id) ON DELETE CASCADE,
  cle              TEXT NOT NULL,
  valeur           TEXT
);
-- Unicité : une seule ligne par (BU, clé) et une seule ligne globale par clé.
CREATE UNIQUE INDEX IF NOT EXISTS commerce_settings_bu_key
  ON commerce_settings (business_unit_id, cle) WHERE business_unit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commerce_settings_global_key
  ON commerce_settings (cle) WHERE business_unit_id IS NULL;

-- Défaut global : workflow de validation désactivé (saisie directe), conforme à la reprise Excel.
INSERT INTO commerce_settings (business_unit_id, cle, valeur)
VALUES (NULL, 'workflow_actif', 'false')
ON CONFLICT DO NOTHING;
