-- Module Commerce → Bons de commande — Lot 1 (référentiels).
-- Additif et idempotent. Deux nouveaux référentiels : Grossistes et Tarifs produit.

-- 1) Grossistes — bénéficiaires externes des bons de commande. Pas de compte CCG en V1 :
--    simple référentiel géré par la Direction commerciale / habilités.
CREATE TABLE IF NOT EXISTS grossistes (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  raison_sociale   TEXT NOT NULL,
  contact_nom      TEXT,
  telephone        TEXT,
  email            TEXT,
  adresse          TEXT,
  zone_id          INTEGER REFERENCES zones_commerciales(id),
  business_unit_id INTEGER REFERENCES business_units(id),
  statut           TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','inactif')),
  date_debut       DATE,
  observations     TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       INTEGER REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grossistes_bu   ON grossistes(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_grossistes_zone ON grossistes(zone_id);

-- 2) Tarifs produit — exactement deux catégories : Commercial et Grossiste.
--    Journal historisé par produit × catégorie : on n'écrase JAMAIS un tarif, on en ouvre un nouveau
--    (date_effet) et on clôt le précédent (date_fin, actif=false). Un seul tarif ACTIF par couple
--    (produit, catégorie) garanti par l'index unique partiel ci-dessous.
CREATE TABLE IF NOT EXISTS commande_tarifs (
  id               SERIAL PRIMARY KEY,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  categorie_tarif  TEXT NOT NULL CHECK (categorie_tarif IN ('commercial','grossiste')),
  prix             NUMERIC(18,4) NOT NULL CHECK (prix >= 0),
  devise           TEXT NOT NULL DEFAULT 'GNF',
  date_effet       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_fin         DATE,
  actif            BOOLEAN NOT NULL DEFAULT true,
  commentaire      TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commande_tarifs_actif_uq
  ON commande_tarifs (product_id, categorie_tarif) WHERE actif;
CREATE INDEX IF NOT EXISTS idx_commande_tarifs_product ON commande_tarifs(product_id);
