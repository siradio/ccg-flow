-- Module QHSE — VOLET SST, domaine SST-03 : accidents, incidents et presque-accidents.
-- Déclaration → enquête → actions → clôture. Les données médicales individuelles ne doivent pas être
-- saisies ici (seules les informations administratives nécessaires). Migration additive.
CREATE TABLE IF NOT EXISTS qhse_sst_accidents (
  id               SERIAL PRIMARY KEY,
  numero           TEXT,
  date_evenement   DATE,
  type_evenement   TEXT NOT NULL DEFAULT 'presque_accident' CHECK (type_evenement IN (
                     'accident_arret', 'accident_sans_arret', 'presque_accident', 'situation_dangereuse')),
  business_unit_id INTEGER REFERENCES business_units(id),
  unite_travail    TEXT,
  lieu             TEXT,
  description      TEXT,
  jours_perdus     INTEGER,
  enquete          TEXT,
  causes           TEXT,
  statut           TEXT NOT NULL DEFAULT 'declare' CHECK (statut IN ('declare', 'enquete', 'cloture')),
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by        INTEGER REFERENCES users(id),
  closed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qhse_sst_accidents ON qhse_sst_accidents (type_evenement, date_evenement DESC);

CREATE TABLE IF NOT EXISTS qhse_sst_accident_actions (
  id              SERIAL PRIMARY KEY,
  accident_id     INTEGER NOT NULL REFERENCES qhse_sst_accidents(id) ON DELETE CASCADE,
  type_action     TEXT,
  description     TEXT,
  responsable     TEXT,
  echeance        DATE,
  statut          TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'en_cours', 'faite')),
  date_realisation DATE,
  ordre           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qhse_sst_acc_actions ON qhse_sst_accident_actions (accident_id);
