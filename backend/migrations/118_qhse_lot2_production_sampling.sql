-- Module QHSE — Lot 2. Deux processus « en ligne » (document CQ-PR003) :
--   A) Contrôles de production : contrôle horaire poids/soudure/étiquette/dates/visuel, par équipe
--      (matin / soir), sur une ligne de conditionnement. Critères paramétrables (référentiel), rien
--      de figé ni d'inventé : chaque critère déclare son type (booléen / numérique) et, le cas
--      échéant, ses seuils.
--   B) Échantillonnage en ligne : plans d'échantillonnage (n/c/m/M, ICMSF) en référentiel + sessions
--      de prélèvement Début / Milieu / Fin par format. Un prélèvement pourra plus tard devenir un
--      échantillon de laboratoire (colonne sample_id = crochet prévu, non câblé dans ce lot).
-- Tables additives / idempotentes.

-- ============================================================================================
-- A) Contrôles de production
-- ============================================================================================

-- Critères de contrôle (référentiel). type_critere : 'booleen' (conforme = OUI) ou 'numerique'
-- (conforme si dans [seuil_min, seuil_max] quand renseignés). Aucun seuil pré-rempli.
CREATE TABLE IF NOT EXISTS qhse_production_criteria (
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

INSERT INTO qhse_production_criteria (code, libelle, type_critere, unite, ordre) VALUES
  ('poids',     'Poids',                 'numerique', 'g', 1),
  ('soudure',   'Soudure / étanchéité',  'booleen',   NULL, 2),
  ('etiquette', 'Étiquetage',            'booleen',   NULL, 3),
  ('dates',     'Dates (fabrication / limite)', 'booleen', NULL, 4),
  ('visuel',    'Aspect visuel',         'booleen',   NULL, 5)
ON CONFLICT DO NOTHING;

-- En-tête d'un contrôle de production (une session = un produit / format / ligne / équipe / jour).
CREATE TABLE IF NOT EXISTS qhse_production_controls (
  id                   SERIAL PRIMARY KEY,
  numero               TEXT,
  date_controle        DATE,
  business_unit_id     INTEGER REFERENCES business_units(id) ON DELETE SET NULL,
  product_id           INTEGER REFERENCES products(id) ON DELETE SET NULL,
  format_id            INTEGER REFERENCES qhse_formats(id) ON DELETE SET NULL,
  conditioning_line_id INTEGER REFERENCES qhse_conditioning_lines(id) ON DELETE SET NULL,
  numero_lot           TEXT,
  equipe               TEXT,                        -- 'matin' | 'soir' (libre)
  responsable          TEXT,
  statut               TEXT NOT NULL DEFAULT 'brouillon',   -- 'brouillon' | 'cloture'
  conformite           TEXT,                        -- 'conforme' | 'non_conforme' | 'en_attente' | 'sans_spec'
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_prod_ctrl_date ON qhse_production_controls(date_controle);

-- Relevés horaires : un point par (heure × critère). Conformité recalculée à l'enregistrement.
CREATE TABLE IF NOT EXISTS qhse_production_readings (
  id          SERIAL PRIMARY KEY,
  control_id  INTEGER NOT NULL REFERENCES qhse_production_controls(id) ON DELETE CASCADE,
  heure       TEXT,
  criteria_id INTEGER REFERENCES qhse_production_criteria(id) ON DELETE SET NULL,
  valeur_num  NUMERIC,
  valeur_bool BOOLEAN,
  conforme    TEXT,
  observation TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qhse_prod_read_ctrl ON qhse_production_readings(control_id);

-- ============================================================================================
-- B) Échantillonnage en ligne
-- ============================================================================================

-- Plans d'échantillonnage (référentiel). n = taille, c = nombre d'acceptation, m / M = seuils
-- (plan ICMSF 3 classes). Rattachables à un paramètre / produit / famille / format (facultatifs).
CREATE TABLE IF NOT EXISTS qhse_sampling_plans (
  id           SERIAL PRIMARY KEY,
  code         TEXT,
  libelle      TEXT NOT NULL,
  parameter_id INTEGER REFERENCES qhse_parameters(id) ON DELETE SET NULL,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  category_id  INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
  format_id    INTEGER REFERENCES qhse_formats(id) ON DELETE SET NULL,
  taille_n     INTEGER,
  acceptation_c INTEGER,
  seuil_m      NUMERIC,
  seuil_grand_m NUMERIC,
  ordre        INTEGER NOT NULL DEFAULT 0,
  actif        BOOLEAN NOT NULL DEFAULT true
);

-- Session de prélèvement en ligne (en-tête).
CREATE TABLE IF NOT EXISTS qhse_samplings (
  id                   SERIAL PRIMARY KEY,
  numero               TEXT,
  date_prelevement     DATE,
  business_unit_id     INTEGER REFERENCES business_units(id) ON DELETE SET NULL,
  product_id           INTEGER REFERENCES products(id) ON DELETE SET NULL,
  format_id            INTEGER REFERENCES qhse_formats(id) ON DELETE SET NULL,
  conditioning_line_id INTEGER REFERENCES qhse_conditioning_lines(id) ON DELETE SET NULL,
  plan_id              INTEGER REFERENCES qhse_sampling_plans(id) ON DELETE SET NULL,
  numero_lot           TEXT,
  responsable          TEXT,
  statut               TEXT NOT NULL DEFAULT 'brouillon',   -- 'brouillon' | 'cloture'
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_sampling_date ON qhse_samplings(date_prelevement);

-- Prélèvements : Début / Milieu / Fin (type de prélèvement = référentiel qhse_sampling_types).
-- sample_id = crochet pour relier ce prélèvement à un échantillon de laboratoire (lot ultérieur).
CREATE TABLE IF NOT EXISTS qhse_sampling_items (
  id               SERIAL PRIMARY KEY,
  sampling_id      INTEGER NOT NULL REFERENCES qhse_samplings(id) ON DELETE CASCADE,
  sampling_type_id INTEGER REFERENCES qhse_sampling_types(id) ON DELETE SET NULL,
  heure            TEXT,
  numero_echantillon TEXT,
  sample_id        INTEGER REFERENCES qhse_samples(id) ON DELETE SET NULL,
  observation      TEXT,
  ordre            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qhse_sampling_items_s ON qhse_sampling_items(sampling_id);
