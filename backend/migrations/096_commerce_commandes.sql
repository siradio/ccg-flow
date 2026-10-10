-- Module Commerce → Bons de commande — Lot 2 (saisie).
-- Additif et idempotent. En-tête + lignes. Le workflow (validations, contrôle stock, documents,
-- historique) est posé au Lot 3 ; ici : brouillon, recalcul serveur, gel des prix, soumission.

-- 1) En-tête de bon de commande commercial.
CREATE TABLE IF NOT EXISTS commandes_commerciales (
  id                   SERIAL PRIMARY KEY,
  numero               TEXT UNIQUE,                       -- attribué à la soumission (BC-COM-AAAA-####)
  type_formulaire      TEXT NOT NULL CHECK (type_formulaire IN ('yaourt','divers')),
  beneficiaire_type    TEXT NOT NULL CHECK (beneficiaire_type IN ('commercial','grossiste')),
  commercial_id        INTEGER REFERENCES commerciaux(id) ON DELETE SET NULL,
  grossiste_id         INTEGER REFERENCES grossistes(id)  ON DELETE SET NULL,
  entity_id            INTEGER REFERENCES entities(id),
  business_unit_id     INTEGER REFERENCES business_units(id),   -- BU de routage (principale / nullable)
  vehicle_id           INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  capacite_figee       INTEGER,                            -- capacité du véhicule gelée (unité du formulaire)
  statut               TEXT NOT NULL DEFAULT 'brouillon'
                         CHECK (statut IN ('brouillon','en_validation','valide','rejetee','annulee')),
  workflow_template_id INTEGER REFERENCES workflow_templates(id),
  current_step_id      INTEGER REFERENCES workflow_steps(id),
  devise               TEXT NOT NULL DEFAULT 'GNF',
  montant_total        NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_casiers        INTEGER NOT NULL DEFAULT 0,
  total_cartons        INTEGER NOT NULL DEFAULT 0,
  taux_remplissage     NUMERIC(6,2),                       -- charge ÷ capacité (%), NULL si pas de véhicule
  motif_sous_charge    TEXT,
  motif_annulation     TEXT,
  version              INTEGER NOT NULL DEFAULT 1,         -- reprise intelligente + garde anti-concurrence
  created_by           INTEGER REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at         TIMESTAMPTZ,
  -- Bénéficiaire cohérent avec son type.
  CONSTRAINT commande_beneficiaire_chk CHECK (
    (beneficiaire_type = 'commercial' AND commercial_id IS NOT NULL AND grossiste_id IS NULL) OR
    (beneficiaire_type = 'grossiste'  AND grossiste_id  IS NOT NULL AND commercial_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_cmd_statut      ON commandes_commerciales(statut);
CREATE INDEX IF NOT EXISTS idx_cmd_commercial  ON commandes_commerciales(commercial_id);
CREATE INDEX IF NOT EXISTS idx_cmd_grossiste   ON commandes_commerciales(grossiste_id);
CREATE INDEX IF NOT EXISTS idx_cmd_created_by  ON commandes_commerciales(created_by);

-- 2) Lignes du bon. Prix GELÉ à la soumission : un changement de tarif ne modifie jamais un bon soumis.
CREATE TABLE IF NOT EXISTS commande_lignes (
  id                   SERIAL PRIMARY KEY,
  commande_id          INTEGER NOT NULL REFERENCES commandes_commerciales(id) ON DELETE CASCADE,
  product_id           INTEGER NOT NULL REFERENCES products(id),
  libelle_fige         TEXT,
  business_unit_id     INTEGER REFERENCES business_units(id),    -- BU figée (sert à l'éventail stock L3)
  unite                TEXT NOT NULL CHECK (unite IN ('casier','carton')),
  quantite             INTEGER NOT NULL CHECK (quantite > 0),
  categorie_tarif      TEXT CHECK (categorie_tarif IN ('commercial','grossiste')),
  prix_unitaire_fige   NUMERIC(18,4) NOT NULL DEFAULT 0,
  montant_ligne        NUMERIC(18,4) NOT NULL DEFAULT 0,
  tarif_source_id      INTEGER REFERENCES commande_tarifs(id),
  UNIQUE (commande_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_cmd_lignes_commande ON commande_lignes(commande_id);

-- 3) Mapping configurable formulaire → Business Units (codes), surchargeable sans redéploiement.
INSERT INTO commerce_settings (business_unit_id, cle, valeur) VALUES
  (NULL, 'bc_bu_codes_yaourt', 'bu_yaourt'),
  (NULL, 'bc_bu_codes_divers', 'bu_lait,bu_tomate,bu_mayo_margarine,bu_divers')
ON CONFLICT DO NOTHING;
