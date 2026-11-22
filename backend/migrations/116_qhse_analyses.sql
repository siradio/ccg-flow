-- Module QHSE — Lot 1. Saisie des analyses de laboratoire (démarrage physico-chimique).
-- Un ÉCHANTILLON (produit/format/lot) porte une ou plusieurs ANALYSES (par type) ; chaque analyse
-- porte des RÉSULTATS par paramètre. La conformité est calculée par comparaison à la spécification
-- en vigueur (qhse_specifications, migration 115) — jamais déduite d'un nom de paramètre.
-- Rigueur : un résultat « non détecté / < LD / < LQ / invalide / en attente » n'est pas un 0 ;
-- un résultat n'est « conforme » que si une spécification applicable existe.

CREATE TABLE IF NOT EXISTS qhse_samples (
  id               SERIAL PRIMARY KEY,
  numero           TEXT,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  format_id        INTEGER REFERENCES qhse_formats(id) ON DELETE SET NULL,
  business_unit_id INTEGER REFERENCES business_units(id) ON DELETE SET NULL,
  numero_lot       TEXT,
  nature           TEXT,
  dp               DATE,            -- date figurant sur le document (DP) — définition métier à confirmer
  de               DATE,            -- date figurant sur le document (DE) — définition métier à confirmer
  motif            TEXT,
  statut           TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'cloture')),
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_samples_product ON qhse_samples(product_id);

CREATE TABLE IF NOT EXISTS qhse_analyses (
  id               SERIAL PRIMARY KEY,
  sample_id        INTEGER NOT NULL REFERENCES qhse_samples(id) ON DELETE CASCADE,
  analysis_type_id INTEGER NOT NULL REFERENCES qhse_analysis_types(id),
  technicien_id    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  date_analyse     DATE,
  statut           TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'saisi', 'valide')),
  conformite       TEXT CHECK (conformite IN ('conforme', 'non_conforme', 'en_attente', 'sans_spec')),
  validated_by     INTEGER REFERENCES users(id),
  validated_at     TIMESTAMPTZ,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_analyses_sample ON qhse_analyses(sample_id);

CREATE TABLE IF NOT EXISTS qhse_results (
  id           SERIAL PRIMARY KEY,
  analysis_id  INTEGER NOT NULL REFERENCES qhse_analyses(id) ON DELETE CASCADE,
  parameter_id INTEGER NOT NULL REFERENCES qhse_parameters(id),
  valeur_num   NUMERIC(18, 6),
  valeur_text  TEXT,
  result_flag  TEXT NOT NULL DEFAULT 'numerique'
                 CHECK (result_flag IN ('numerique', 'non_detecte', 'inf_ld', 'inf_lq', 'invalide', 'en_attente')),
  conformite   TEXT CHECK (conformite IN ('conforme', 'non_conforme', 'en_attente', 'sans_spec')),
  spec_id      INTEGER REFERENCES qhse_specifications(id) ON DELETE SET NULL,
  observation  TEXT,
  UNIQUE (analysis_id, parameter_id)
);
