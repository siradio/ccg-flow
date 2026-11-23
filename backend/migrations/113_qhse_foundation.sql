-- Module QHSE — Lot 0 (socle). Catalogues du laboratoire : types d'analyses, paramètres,
-- milieux de culture et germes. Tables additives, idempotentes ; aucun seuil ni règle de
-- conformité n'est posé ici (les spécifications/seuils arrivent au Lot 1, paramétrables et
-- validés par le responsable QHSE). Les valeurs amorcées ci-dessous sont CELLES DES DOCUMENTS
-- SOGUIPAL (ENR-CQ04 physico-chimique, EN-CQ05 microbiologie) — rien n'est inventé.

-- Types d'analyses -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qhse_analysis_types (
  id      SERIAL PRIMARY KEY,
  code    TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0,
  actif   BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO qhse_analysis_types (code, libelle, ordre) VALUES
  ('physico_chimique', 'Physico-chimique', 1),
  ('microbiologique',  'Microbiologique',  2),
  ('organoleptique',   'Organoleptique',   3)
ON CONFLICT (code) DO NOTHING;

-- Paramètres analytiques -----------------------------------------------------------------------
-- type_resultat : numerique | qualitatif | booleen | texte. unite laissée libre (à compléter
-- dans le référentiel) sauf quand le document la donne explicitement (ufc/g en microbiologie).
CREATE TABLE IF NOT EXISTS qhse_parameters (
  id               SERIAL PRIMARY KEY,
  analysis_type_id INTEGER NOT NULL REFERENCES qhse_analysis_types(id) ON DELETE CASCADE,
  code             TEXT NOT NULL UNIQUE,
  libelle          TEXT NOT NULL,
  unite            TEXT,
  type_resultat    TEXT NOT NULL DEFAULT 'numerique'
                     CHECK (type_resultat IN ('numerique', 'qualitatif', 'booleen', 'texte')),
  methode          TEXT,
  precision_decimales INTEGER,
  obligatoire      BOOLEAN NOT NULL DEFAULT false,
  ordre            INTEGER NOT NULL DEFAULT 0,
  actif            BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_qhse_parameters_type ON qhse_parameters(analysis_type_id);

-- Amorçage des paramètres à partir des fiches de paillasse.
INSERT INTO qhse_parameters (analysis_type_id, code, libelle, unite, type_resultat, ordre)
SELECT t.id, v.code, v.libelle, v.unite, v.type_resultat, v.ordre
FROM (VALUES
  -- Physico-chimiques (ENR-CQ04)
  ('physico_chimique', 'ms_humidite', 'Matières sèches / Humidité', NULL, 'numerique', 1),
  ('physico_chimique', 'ph',          'pH',                         NULL, 'numerique', 2),
  ('physico_chimique', 'acidite',     'Acidité',                    NULL, 'numerique', 3),
  ('physico_chimique', 'brix',        'Brix',                       NULL, 'numerique', 4),
  ('physico_chimique', 'ir',          'Indice de réfraction (IR)',  NULL, 'numerique', 5),
  ('physico_chimique', 'visc_d',      'Viscosité D',                NULL, 'numerique', 6),
  ('physico_chimique', 'visc_f',      'Viscosité F',                NULL, 'numerique', 7),
  -- Organoleptiques (ENR-CQ04)
  ('organoleptique',   'aspect',      'Aspect',                     NULL, 'qualitatif', 1),
  ('organoleptique',   'couleur',     'Couleur',                    NULL, 'qualitatif', 2),
  ('organoleptique',   'gout',        'Goût',                       NULL, 'qualitatif', 3),
  ('organoleptique',   'saveur',      'Saveur',                     NULL, 'qualitatif', 4),
  -- Microbiologiques (EN-CQ05) — unité ufc/g donnée par le document
  ('microbiologique',  'fmat',        'Flore mésophile aérobie totale (FMAT)', 'ufc/g', 'numerique', 1),
  ('microbiologique',  'lm',          'Levures et moisissures',                 'ufc/g', 'numerique', 2),
  ('microbiologique',  'ct',          'Coliformes totaux',                      'ufc/g', 'numerique', 3),
  ('microbiologique',  'cf',          'Coliformes fécaux',                      'ufc/g', 'numerique', 4),
  ('microbiologique',  'ecoli',       'E. coli',                                'ufc/g', 'numerique', 5),
  ('microbiologique',  'entero',      'Entérobactéries',                        'ufc/g', 'numerique', 6)
) AS v(type_code, code, libelle, unite, type_resultat, ordre)
JOIN qhse_analysis_types t ON t.code = v.type_code
ON CONFLICT (code) DO NOTHING;

-- Milieux de culture (EN-CQ05) -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qhse_culture_media (
  id      SERIAL PRIMARY KEY,
  code    TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0,
  actif   BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO qhse_culture_media (code, libelle, ordre) VALUES
  ('vrbl', 'Milieu VRBL', 1),
  ('vrbg', 'Milieu VRBG', 2),
  ('pda',  'Milieu PDA',  3),
  ('pca',  'Milieu PCA',  4),
  ('tbx',  'Milieu TBX',  5),
  ('ept',  'Milieu EPT',  6)
ON CONFLICT (code) DO NOTHING;

-- Germes recherchés (EN-CQ05, paramètres analysés) --------------------------------------------
CREATE TABLE IF NOT EXISTS qhse_germs (
  id      SERIAL PRIMARY KEY,
  code    TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  ordre   INTEGER NOT NULL DEFAULT 0,
  actif   BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO qhse_germs (code, libelle, ordre) VALUES
  ('fmat',   'Flore mésophile aérobie totale', 1),
  ('lm',     'Levures et moisissures',         2),
  ('ct',     'Coliformes totaux',              3),
  ('cf',     'Coliformes fécaux',              4),
  ('ecoli',  'E. coli',                        5),
  ('entero', 'Entérobactéries',                6)
ON CONFLICT (code) DO NOTHING;
