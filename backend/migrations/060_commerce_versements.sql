-- Module Commerce — Phase F : versements (en-tête + lignes normalisées) & justificatifs.
-- Modèle normalisé : AUCUNE colonne par moyen de paiement — chaque montant est une ligne
-- (commercial_payment_details) référençant un payment_method. Pas de suppression physique
-- d'une transaction (annulation contrôlée via statut).

-- 1) En-tête du versement. business_unit_id est FIGÉ à la saisie (snapshot) : les versements
--    passés ne sont jamais recalculés selon l'affectation actuelle du commercial.
CREATE TABLE IF NOT EXISTS commercial_payments (
  id                 SERIAL PRIMARY KEY,
  reference          TEXT,
  commercial_id      INTEGER NOT NULL REFERENCES commerciaux(id),
  assignment_id      INTEGER REFERENCES commercial_assignments(id),
  business_unit_id   INTEGER REFERENCES business_units(id),
  product_id         INTEGER REFERENCES products(id),
  payment_date       DATE NOT NULL,
  total_amount       NUMERIC(16,2) NOT NULL DEFAULT 0,
  reference_generale TEXT,
  commentaire        TEXT,
  status             TEXT NOT NULL DEFAULT 'valide'
                       CHECK (status IN ('brouillon','soumis','valide','rejete','annule')),
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         INTEGER REFERENCES users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at       TIMESTAMPTZ,
  validated_by       INTEGER REFERENCES users(id),
  validated_at       TIMESTAMPTZ,
  motif              TEXT
);
CREATE INDEX IF NOT EXISTS idx_cpay_bu        ON commercial_payments(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_cpay_commercial ON commercial_payments(commercial_id);
CREATE INDEX IF NOT EXISTS idx_cpay_date       ON commercial_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_cpay_status     ON commercial_payments(status);

-- 2) Lignes : un montant par moyen de versement (répartition possible sur plusieurs moyens).
CREATE TABLE IF NOT EXISTS commercial_payment_details (
  id                     SERIAL PRIMARY KEY,
  commercial_payment_id  INTEGER NOT NULL REFERENCES commercial_payments(id) ON DELETE CASCADE,
  payment_method_id      INTEGER NOT NULL REFERENCES payment_methods(id),
  amount                 NUMERIC(16,2) NOT NULL DEFAULT 0,
  bank_id                INTEGER REFERENCES banks(id),
  transaction_reference  TEXT,
  transaction_date       DATE,
  commentaire            TEXT
);
CREATE INDEX IF NOT EXISTS idx_cpaydet_payment ON commercial_payment_details(commercial_payment_id);

-- 3) Pièces jointes : étend la table `attachments` existante (réutilise Blob + BYTEA).
--    Le justificatif peut être rattaché au versement OU précisément à une ligne de moyen.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS commercial_payment_id        INTEGER REFERENCES commercial_payments(id) ON DELETE CASCADE;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS commercial_payment_detail_id INTEGER REFERENCES commercial_payment_details(id) ON DELETE CASCADE;

-- Remplace la contrainte « exactement un parent » pour inclure le nouveau parent Commerce.
-- (Le détail est un sous-parent optionnel : la contrainte porte sur le versement.)
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'attachments'::regclass AND contype = 'c';
  IF cname IS NOT NULL THEN EXECUTE 'ALTER TABLE attachments DROP CONSTRAINT ' || quote_ident(cname); END IF;
END $$;

ALTER TABLE attachments ADD CONSTRAINT attachments_one_parent CHECK (
  (purchase_request_id IS NOT NULL)::int +
  (quote_id IS NOT NULL)::int +
  (purchase_order_id IS NOT NULL)::int +
  (commercial_payment_id IS NOT NULL)::int = 1
);
