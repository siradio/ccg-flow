-- Module QHSE — Volet Qualité, domaine QUA-11 : audits (programme, réalisation, constats, actions).
-- Audit (interne / externe / fournisseur) + constats (non-conformité / observation / point fort) avec
-- action, responsable, échéance. Migration additive.
CREATE TABLE IF NOT EXISTS qhse_audits (
  id               SERIAL PRIMARY KEY,
  numero           TEXT,
  date_audit       DATE,
  type_audit       TEXT CHECK (type_audit IN ('interne', 'externe', 'fournisseur') OR type_audit IS NULL),
  perimetre        TEXT,
  auditeur         TEXT,
  referentiel      TEXT,
  business_unit_id INTEGER REFERENCES business_units(id),
  statut           TEXT NOT NULL DEFAULT 'planifie' CHECK (statut IN ('planifie', 'realise', 'cloture')),
  synthese         TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by        INTEGER REFERENCES users(id),
  closed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qhse_audits_statut ON qhse_audits (statut, date_audit DESC);

CREATE TABLE IF NOT EXISTS qhse_audit_findings (
  id           SERIAL PRIMARY KEY,
  audit_id     INTEGER NOT NULL REFERENCES qhse_audits(id) ON DELETE CASCADE,
  type_constat TEXT,                                    -- non_conformite / observation / point_fort / conformite
  description  TEXT,
  reference    TEXT,
  action       TEXT,
  responsable  TEXT,
  echeance     DATE,
  statut       TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'en_cours', 'faite')),
  ordre        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qhse_audit_findings ON qhse_audit_findings (audit_id);
