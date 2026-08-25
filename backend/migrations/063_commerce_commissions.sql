-- Module Commerce — Commissions/primes. Barème paramétrable par palier de CA mensuel (global ou
-- par BU), et commissions calculées par mois × commercial avec statuts. Une commission validée ou
-- payée n'est JAMAIS recalculée rétroactivement (le taux appliqué est figé sur la ligne).

-- Barème : paliers (CA mensuel minimum -> taux). business_unit_id NULL = barème global par défaut.
CREATE TABLE IF NOT EXISTS commission_rules (
  id               SERIAL PRIMARY KEY,
  business_unit_id INTEGER REFERENCES business_units(id) ON DELETE CASCADE,
  palier_min       NUMERIC(16,2) NOT NULL DEFAULT 0,   -- CA mensuel minimum pour ce taux
  taux             NUMERIC(6,4) NOT NULL DEFAULT 0,     -- fraction : 0.01 = 1 %
  actif            BOOLEAN NOT NULL DEFAULT true,
  date_debut       DATE,
  date_fin         DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commrule_bu ON commission_rules(business_unit_id);

-- Commissions calculées (une par mois × commercial). Le taux et le montant sont figés à la ligne.
CREATE TABLE IF NOT EXISTS commissions (
  id               SERIAL PRIMARY KEY,
  periode          DATE NOT NULL,
  commercial_id    INTEGER NOT NULL REFERENCES commerciaux(id) ON DELETE CASCADE,
  business_unit_id INTEGER REFERENCES business_units(id),
  base_montant     NUMERIC(16,2) NOT NULL DEFAULT 0,    -- CA validé du mois
  taux             NUMERIC(6,4) NOT NULL DEFAULT 0,
  montant          NUMERIC(16,2) NOT NULL DEFAULT 0,
  rule_id          INTEGER REFERENCES commission_rules(id),
  statut           TEXT NOT NULL DEFAULT 'calculee'
                     CHECK (statut IN ('calculee','validee','payee','annulee')),
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_by     INTEGER REFERENCES users(id),
  validated_at     TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  motif            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_commission_periode_commercial ON commissions(periode, commercial_id);
CREATE INDEX IF NOT EXISTS idx_commission_periode ON commissions(periode);

-- Barème par défaut : 1 % dès le premier franc (repris des fichiers Excel).
INSERT INTO commission_rules (business_unit_id, palier_min, taux)
SELECT NULL, 0, 0.01
WHERE NOT EXISTS (SELECT 1 FROM commission_rules);
