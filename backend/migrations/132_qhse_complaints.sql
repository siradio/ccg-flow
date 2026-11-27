-- Module QHSE — Volet Qualité, domaine QUA-08 : réclamations et retours clients.
-- Enregistrement → investigation → réponse → suivi (actions) → clôture. Lien facultatif vers une
-- non-conformité (CAPA). Aucune règle inventée : gravité depuis le référentiel, statuts explicites,
-- clôture manuelle. Migration additive.
CREATE TABLE IF NOT EXISTS qhse_complaints (
  id                 SERIAL PRIMARY KEY,
  numero             TEXT,
  date_reclamation   DATE,
  client             TEXT,
  canal              TEXT,                                   -- e-mail / téléphone / courrier / visite…
  type_reclamation   TEXT,                                   -- qualité produit / emballage / livraison / étiquetage…
  severity_id        INTEGER REFERENCES qhse_nc_severities(id),
  business_unit_id   INTEGER REFERENCES business_units(id),
  product_id         INTEGER REFERENCES products(id),
  format_id          INTEGER REFERENCES qhse_formats(id),
  numero_lot         TEXT,
  quantite_concernee TEXT,
  description        TEXT,
  investigation      TEXT,
  reponse_client     TEXT,
  nc_id              INTEGER REFERENCES qhse_nonconformities(id),
  statut             TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte', 'investigation', 'reponse', 'cloturee')),
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by          INTEGER REFERENCES users(id),
  closed_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qhse_complaints_statut ON qhse_complaints (statut, date_reclamation DESC);

-- Actions de traitement (correctives / préventives) rattachées à la réclamation.
CREATE TABLE IF NOT EXISTS qhse_complaint_actions (
  id              SERIAL PRIMARY KEY,
  complaint_id    INTEGER NOT NULL REFERENCES qhse_complaints(id) ON DELETE CASCADE,
  type_action     TEXT,                                      -- corrective / preventive
  description     TEXT,
  responsable     TEXT,
  echeance        DATE,
  statut          TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'en_cours', 'faite')),
  date_realisation DATE,
  ordre           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qhse_complaint_actions_c ON qhse_complaint_actions (complaint_id);
