-- Module QHSE — Lot 0 (complément). Vocabulaires contrôlés présents dans les documents SOGUIPAL :
-- lignes de conditionnement, saveurs, formats, types de prélèvement, niveaux de gravité des
-- non-conformités. Tables additives/idempotentes ; valeurs = celles des documents (échantillonnage
-- CQ-PR003, contrôles yaourt, diagramme NC). Serviront aux lots Échantillonnage / Contrôles / NC.

-- Lignes de conditionnement (fiche d'échantillonnage : ERCA, SEZMAK 1-4, VOLPAK) --------------
CREATE TABLE IF NOT EXISTS qhse_conditioning_lines (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0, actif BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO qhse_conditioning_lines (code, libelle, ordre) VALUES
  ('erca',     'ERCA',     1),
  ('sezmak_1', 'SEZMAK 1', 2),
  ('sezmak_2', 'SEZMAK 2', 3),
  ('sezmak_3', 'SEZMAK 3', 4),
  ('sezmak_4', 'SEZMAK 4', 5),
  ('volpak',   'VOLPAK',   6)
ON CONFLICT (code) DO NOTHING;

-- Saveurs (contrôle / échantillonnage yaourt) -------------------------------------------------
CREATE TABLE IF NOT EXISTS qhse_flavors (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0, actif BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO qhse_flavors (code, libelle, ordre) VALUES
  ('vanille', 'Vanille', 1),
  ('fraise',  'Fraise',  2),
  ('nature',  'Nature',  3),
  ('banane',  'Banane',  4)
ON CONFLICT (code) DO NOTHING;

-- Formats de conditionnement (fiche d'échantillonnage) ----------------------------------------
CREATE TABLE IF NOT EXISTS qhse_formats (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0, actif BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO qhse_formats (code, libelle, ordre) VALUES
  ('erca_125g',   'ERCA 125 g',    1),
  ('volpak_125ml','Volpak 125 ml', 2),
  ('sez_170g',    'SEZ 170 g',     3),
  ('sez_350g',    'SEZ 350 g',     4),
  ('sez_900g',    'SEZ 900 g',     5),
  ('sez_2500g',   'SEZ 2.5 Kg',    6)
ON CONFLICT (code) DO NOTHING;

-- Types de prélèvement (Début / Milieu / Fin de production) ------------------------------------
CREATE TABLE IF NOT EXISTS qhse_sampling_types (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0, actif BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO qhse_sampling_types (code, libelle, ordre) VALUES
  ('debut',  'Début',  1),
  ('milieu', 'Milieu', 2),
  ('fin',    'Fin',    3)
ON CONFLICT (code) DO NOTHING;

-- Niveaux de gravité des non-conformités (diagramme IN-CQ06) -----------------------------------
CREATE TABLE IF NOT EXISTS qhse_nc_severities (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0, actif BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO qhse_nc_severities (code, libelle, ordre) VALUES
  ('mineure',  'Mineure',  1),
  ('majeure',  'Majeure',  2),
  ('critique', 'Critique', 3)
ON CONFLICT (code) DO NOTHING;
