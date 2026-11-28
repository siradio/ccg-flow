-- Module QHSE — Plan d'actions QHSE (registre d'actions transverse). Registre central des actions
-- correctives / préventives / d'amélioration, quelle qu'en soit l'origine (audit, réclamation,
-- accident, inspection, non-conformité, revue de direction…). Permet de suivre l'avancement et
-- l'efficacité en un seul endroit, en complément des actions saisies dans chaque module source
-- (la référence de l'origine est libre, ex. « AUD-00012 »). Migration additive.
CREATE TABLE IF NOT EXISTS qhse_actions (
  id               SERIAL PRIMARY KEY,
  numero           TEXT,
  origine          TEXT NOT NULL DEFAULT 'autre' CHECK (origine IN (
                     'audit', 'reclamation', 'accident', 'inspection', 'non_conformite', 'revue_direction', 'reglementaire', 'autre')),
  reference_origine TEXT,
  domaine          TEXT CHECK (domaine IN ('qualite', 'hygiene', 'securite', 'environnement', 'transverse')),
  business_unit_id INTEGER REFERENCES business_units(id),
  type_action      TEXT NOT NULL DEFAULT 'corrective' CHECK (type_action IN ('corrective', 'preventive', 'amelioration')),
  description      TEXT,
  responsable      TEXT,
  echeance         DATE,
  statut           TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'en_cours', 'faite', 'annulee')),
  date_realisation DATE,
  efficacite       TEXT NOT NULL DEFAULT 'non_evaluee' CHECK (efficacite IN ('non_evaluee', 'efficace', 'inefficace')),
  observations     TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qhse_actions ON qhse_actions (statut, origine, echeance);
