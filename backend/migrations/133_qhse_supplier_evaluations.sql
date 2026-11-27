-- Module QHSE — Volet Qualité, domaine QUA-09 : gestion et évaluation des fournisseurs.
-- Qualification initiale + évaluations périodiques. Note globale + grille de critères (JSONB) +
-- statut de qualification. Réutilise le référentiel `suppliers` (module Achats). Migration additive.
CREATE TABLE IF NOT EXISTS qhse_supplier_evaluations (
  id             SERIAL PRIMARY KEY,
  supplier_id    INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  date_evaluation DATE,
  type           TEXT NOT NULL DEFAULT 'periodique' CHECK (type IN ('qualification', 'periodique')),
  note           NUMERIC,
  note_max       NUMERIC,
  statut         TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'qualifie', 'sous_reserve', 'rejete')),
  criteria       JSONB,                              -- [{ label, note, note_max }]
  commentaire    TEXT,
  evaluated_by   INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_supplier_eval ON qhse_supplier_evaluations (supplier_id, date_evaluation DESC);
