-- CCG Flow — schéma initial (référentiels + module Demande d'achat)
-- Voir SPEC.md §1 pour le détail des entités et relations.

-- ─── Référentiels transverses ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entities (
  id   SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code IN ('CCG', 'SOGUIPAL', 'PBIC')),
  nom  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  nom           TEXT NOT NULL,
  prenom        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  actif         BOOLEAN NOT NULL DEFAULT true,
  employee_id   INTEGER, -- FK ajoutée après création de employees
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_entity_roles (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id  INTEGER REFERENCES entities(id) ON DELETE CASCADE, -- NULL = rôle global (super_admin)
  role_code  TEXT NOT NULL CHECK (role_code IN ('super_admin', 'demandeur', 'service_achat', 'controle_gestion', 'finances', 'dga')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_id, role_code)
);

CREATE TABLE IF NOT EXISTS sites (
  id        SERIAL PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  nom       TEXT NOT NULL,
  adresse   TEXT,
  ville     TEXT
);

CREATE TABLE IF NOT EXISTS warehouses (
  id      SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  nom     TEXT NOT NULL,
  code    TEXT
);

CREATE TABLE IF NOT EXISTS machines (
  id        SERIAL PRIMARY KEY,
  site_id   INTEGER NOT NULL REFERENCES sites(id),
  nom       TEXT NOT NULL,
  reference TEXT,
  categorie TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id        SERIAL PRIMARY KEY,
  matricule TEXT,
  nom       TEXT NOT NULL,
  prenom    TEXT NOT NULL,
  poste     TEXT,
  service   TEXT,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  site_id   INTEGER REFERENCES sites(id),
  actif     BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE users
  ADD CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id);

CREATE TABLE IF NOT EXISTS suppliers (
  id           SERIAL PRIMARY KEY,
  nom          TEXT NOT NULL,
  contact_nom  TEXT,
  contact_email TEXT,
  contact_tel  TEXT,
  adresse      TEXT,
  actif        BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS supplier_entities (
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  entity_id   INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (supplier_id, entity_id)
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  code        TEXT UNIQUE,
  designation TEXT NOT NULL,
  categorie   TEXT NOT NULL CHECK (categorie IN ('matiere_premiere', 'consommable', 'materiel_informatique', 'piece_detachee', 'autre')),
  unite       TEXT,
  actif       BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS product_entities (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  entity_id  INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, entity_id)
);

-- ─── Moteur de workflow générique ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_templates (
  id          SERIAL PRIMARY KEY,
  module_code TEXT NOT NULL UNIQUE,
  nom         TEXT NOT NULL,
  actif       BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id                                SERIAL PRIMARY KEY,
  workflow_template_id              INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  ordre                             INTEGER NOT NULL,
  code                              TEXT NOT NULL,
  nom                               TEXT NOT NULL,
  role_code_requis                  TEXT, -- NULL = étape système (ex. génération auto du BC)
  commentaire_obligatoire_si_refus  BOOLEAN NOT NULL DEFAULT false,
  comportement_si_refus             TEXT CHECK (comportement_si_refus IN ('retour_etape_precedente', 'annulation')),
  retour_step_code                  TEXT, -- code de l'étape vers laquelle revenir si comportement_si_refus = 'retour_etape_precedente'
  UNIQUE (workflow_template_id, ordre),
  UNIQUE (workflow_template_id, code)
);

-- ─── Demande d'achat ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_requests (
  id                   SERIAL PRIMARY KEY,
  numero               TEXT NOT NULL UNIQUE,
  entity_id            INTEGER NOT NULL REFERENCES entities(id),
  workflow_template_id INTEGER NOT NULL REFERENCES workflow_templates(id),
  requester_user_id    INTEGER NOT NULL REFERENCES users(id),
  site_id              INTEGER REFERENCES sites(id),
  objet                TEXT NOT NULL,
  justification        TEXT,
  status               TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN (
                          'brouillon', 'soumise', 'en_analyse_achat', 'devis_en_cours', 'devis_selectionne',
                          'en_validation', 'validee', 'rejetee', 'bon_commande_genere'
                        )),
  current_step_id      INTEGER REFERENCES workflow_steps(id),
  devise               TEXT NOT NULL DEFAULT 'GNF' CHECK (devise IN ('GNF', 'USD', 'EUR')),
  montant_estime        NUMERIC(16, 2),
  montant_final          NUMERIC(16, 2),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_request_lines (
  id                      SERIAL PRIMARY KEY,
  purchase_request_id    INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  product_id              INTEGER REFERENCES products(id),
  description_libre        TEXT,
  quantite                NUMERIC(14, 2) NOT NULL,
  unite                   TEXT,
  prix_unitaire_estime     NUMERIC(16, 2),
  prix_unitaire_final       NUMERIC(16, 2),
  fournisseur_retenu_id    INTEGER REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS quote_requests (
  id                    SERIAL PRIMARY KEY,
  purchase_request_id  INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  created_by            INTEGER NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  message                TEXT
);

CREATE TABLE IF NOT EXISTS quote_request_suppliers (
  id               SERIAL PRIMARY KEY,
  quote_request_id INTEGER NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  supplier_id       INTEGER NOT NULL REFERENCES suppliers(id),
  sent_at           TIMESTAMPTZ,
  statut            TEXT NOT NULL DEFAULT 'a_envoyer' CHECK (statut IN ('a_envoyer', 'envoye', 'echec_envoi', 'devis_recu', 'refuse'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id                        SERIAL PRIMARY KEY,
  quote_request_supplier_id INTEGER NOT NULL REFERENCES quote_request_suppliers(id) ON DELETE CASCADE,
  montant                   NUMERIC(16, 2) NOT NULL,
  devise                    TEXT NOT NULL DEFAULT 'GNF' CHECK (devise IN ('GNF', 'USD', 'EUR')),
  recu_le                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  selectionne               BOOLEAN NOT NULL DEFAULT false,
  notes                     TEXT
);

CREATE TABLE IF NOT EXISTS approvals (
  id                 SERIAL PRIMARY KEY,
  purchase_request_id INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  workflow_step_id    INTEGER NOT NULL REFERENCES workflow_steps(id),
  statut              TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validee', 'refusee')),
  validated_by         INTEGER REFERENCES users(id),
  commentaire          TEXT,
  decided_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                  SERIAL PRIMARY KEY,
  purchase_request_id INTEGER NOT NULL UNIQUE REFERENCES purchase_requests(id),
  numero              TEXT NOT NULL UNIQUE,
  supplier_id          INTEGER NOT NULL REFERENCES suppliers(id),
  montant              NUMERIC(16, 2) NOT NULL,
  devise               TEXT NOT NULL,
  generated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  envoye_le            TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS attachments (
  id                  SERIAL PRIMARY KEY,
  purchase_request_id INTEGER REFERENCES purchase_requests(id) ON DELETE CASCADE,
  quote_id             INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
  purchase_order_id    INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
  filename             TEXT NOT NULL,
  mimetype             TEXT NOT NULL,
  content              BYTEA NOT NULL,
  taille               INTEGER NOT NULL,
  uploaded_by          INTEGER NOT NULL REFERENCES users(id),
  uploaded_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (purchase_request_id IS NOT NULL)::int +
    (quote_id IS NOT NULL)::int +
    (purchase_order_id IS NOT NULL)::int = 1
  )
);

CREATE TABLE IF NOT EXISTS audit_log (
  id                  SERIAL PRIMARY KEY,
  table_name          TEXT NOT NULL,
  record_id           INTEGER NOT NULL,
  purchase_request_id INTEGER REFERENCES purchase_requests(id) ON DELETE CASCADE,
  action              TEXT NOT NULL,
  user_id             INTEGER REFERENCES users(id),
  details             JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  lien       TEXT,
  lu         BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Index utiles ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_purchase_requests_entity ON purchase_requests(entity_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_user_entity_roles_user ON user_entity_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_purchase_request ON audit_log(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, lu);
