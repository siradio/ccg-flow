-- Module Demandes d'achat — frais annexes des devis (TVA, Freight, Mise à FOB, Transport, Autres…).
-- Demande Madynatou (priorité haute) : séparer les charges pour l'analyse des coûts, visibilité des
-- frais AVANT validation, éviter surfacturation/doublons. Les frais se saisissent PAR DEVIS (coût
-- complet comparable entre fournisseurs = articles + frais), via un référentiel paramétrable ; à la
-- sélection d'un devis, ses frais sont reportés sur la demande (total articles + sous-total frais +
-- total général). Additif et idempotent.

-- 1) Référentiel paramétrable des types de frais.
CREATE TABLE IF NOT EXISTS quote_fee_types (
  id          SERIAL PRIMARY KEY,
  libelle     TEXT NOT NULL,
  ordre       INTEGER NOT NULL DEFAULT 0,
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO quote_fee_types (libelle, ordre) VALUES
  ('TVA', 1),
  ('Freight', 2),
  ('Mise à FOB', 3),
  ('Transport', 4),
  ('Autres', 99)
ON CONFLICT DO NOTHING;

-- 2) Frais d'un devis fournisseur (type figé + montant). libelle_fige = instantané du libellé du
--    type au moment de la saisie → l'historique reste lisible même si le type est renommé/supprimé.
CREATE TABLE IF NOT EXISTS quote_fees (
  id           SERIAL PRIMARY KEY,
  quote_id     INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  fee_type_id  INTEGER REFERENCES quote_fee_types(id) ON DELETE SET NULL,
  libelle_fige TEXT NOT NULL,
  montant      NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ordre        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quote_fees_quote ON quote_fees(quote_id);

-- 3) Frais reportés sur la demande (copie du devis retenu, comme les prix de lignes) — sert au BC,
--    au PDF et aux rapports. + sous-total des frais mémorisé sur la demande (total articles =
--    montant_final existant ; total général = montant_final + montant_frais).
CREATE TABLE IF NOT EXISTS purchase_request_fees (
  id                  SERIAL PRIMARY KEY,
  purchase_request_id INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  fee_type_id         INTEGER REFERENCES quote_fee_types(id) ON DELETE SET NULL,
  libelle_fige        TEXT NOT NULL,
  montant             NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ordre               INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pr_fees_pr ON purchase_request_fees(purchase_request_id);

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS montant_frais NUMERIC(18, 2) NOT NULL DEFAULT 0;
