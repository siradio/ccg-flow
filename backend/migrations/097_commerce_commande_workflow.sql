-- Module Commerce → Bons de commande — Lot 3 (workflow de validation).
-- Additif et idempotent. Décisions du circuit + contrôle stock manuel par BU (éventail) + journal.

-- 1) Décisions du workflow (équivalent d'`approvals`, mais `approvals` est lié par FK à
--    purchase_requests). Une ligne par étape ouverte ; signature_contenu sert à la reprise
--    intelligente (on ne refait pas une étape dont le périmètre n'a pas changé).
CREATE TABLE IF NOT EXISTS commande_validations (
  id                SERIAL PRIMARY KEY,
  commande_id       INTEGER NOT NULL REFERENCES commandes_commerciales(id) ON DELETE CASCADE,
  step_id           INTEGER NOT NULL REFERENCES workflow_steps(id),
  step_code         TEXT NOT NULL,
  role_code         TEXT,
  statut            TEXT NOT NULL DEFAULT 'en_attente'
                      CHECK (statut IN ('en_attente','validee','retournee','rejetee')),
  decided_by        INTEGER REFERENCES users(id),
  decided_at        TIMESTAMPTZ,
  commentaire       TEXT,
  signature_contenu TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmd_valid_commande ON commande_validations(commande_id);
CREATE INDEX IF NOT EXISTS idx_cmd_valid_pending  ON commande_validations(commande_id, step_id) WHERE statut = 'en_attente';

-- 2) Contrôle stock MANUEL, en éventail : une ligne par BU présente dans le bon. L'étape stock
--    n'est validée que lorsque toutes les BU sont confirmées disponibles. Aucune intégration
--    automatique en V1 (voir stock-provider.js, mode 'manual').
CREATE TABLE IF NOT EXISTS commande_controle_stock (
  id                SERIAL PRIMARY KEY,
  commande_id       INTEGER NOT NULL REFERENCES commandes_commerciales(id) ON DELETE CASCADE,
  business_unit_id  INTEGER NOT NULL REFERENCES business_units(id),
  disponible        BOOLEAN,                 -- NULL = en attente de confirmation
  confirme_par      INTEGER REFERENCES users(id),
  commentaire       TEXT,
  confirmed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commande_id, business_unit_id)
);
CREATE INDEX IF NOT EXISTS idx_cmd_stock_commande ON commande_controle_stock(commande_id);

-- 3) Journal d'événements (audit métier du bon).
CREATE TABLE IF NOT EXISTS commande_historique (
  id            SERIAL PRIMARY KEY,
  commande_id   INTEGER NOT NULL REFERENCES commandes_commerciales(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,
  from_statut   TEXT,
  to_statut     TEXT,
  step_code     TEXT,
  acteur_user_id INTEGER REFERENCES users(id),
  commentaire   TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmd_hist_commande ON commande_historique(commande_id);
