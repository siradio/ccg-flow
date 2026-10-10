-- Module Commerce → Bons de commande — Lot 4 (document PDF).
-- Additif et idempotent. Archive du bon de commande généré après validation complète du circuit.
-- Unicité (commande_id, type) : évite la double génération (ré-génération = mise à jour en place).
CREATE TABLE IF NOT EXISTS commande_documents (
  id           SERIAL PRIMARY KEY,
  commande_id  INTEGER NOT NULL REFERENCES commandes_commerciales(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'bon_commande',
  contenu      BYTEA,
  mime         TEXT NOT NULL DEFAULT 'application/pdf',
  genere_par   INTEGER REFERENCES users(id),
  genere_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commande_id, type)
);
CREATE INDEX IF NOT EXISTS idx_cmd_docs_commande ON commande_documents(commande_id);
