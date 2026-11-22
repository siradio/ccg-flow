-- Module QHSE — Lot 1 (début). Spécifications / seuils de conformité par paramètre.
-- Flexible sans imposer de choix métier : une spécification peut cibler un PRODUIT précis, une
-- FAMILLE (catégorie produit) et/ou un FORMAT. À l'analyse (lot ultérieur), la plus spécifique
-- l'emporte (produit+format > produit > famille). Versionnée : une nouvelle version n'écrase pas
-- l'ancienne (date_effet + version + actif), pour ne jamais réinterpréter rétroactivement une
-- analyse déjà validée. Aucun seuil n'est pré-rempli : c'est le responsable QHSE qui les saisit.
CREATE TABLE IF NOT EXISTS qhse_specifications (
  id            SERIAL PRIMARY KEY,
  parameter_id  INTEGER NOT NULL REFERENCES qhse_parameters(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id) ON DELETE CASCADE,
  category_id   INTEGER REFERENCES product_categories(id) ON DELETE CASCADE,
  format_id     INTEGER REFERENCES qhse_formats(id) ON DELETE SET NULL,
  seuil_min     NUMERIC(16, 4),
  seuil_max     NUMERIC(16, 4),
  critere       TEXT,            -- critère qualitatif / commentaire de conformité (texte libre)
  version       INTEGER NOT NULL DEFAULT 1,
  date_effet    DATE,
  actif         BOOLEAN NOT NULL DEFAULT true,
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_specs_parameter ON qhse_specifications(parameter_id);
CREATE INDEX IF NOT EXISTS idx_qhse_specs_product   ON qhse_specifications(product_id);
CREATE INDEX IF NOT EXISTS idx_qhse_specs_category  ON qhse_specifications(category_id);
