-- Prix par ligne d'un devis fournisseur : chaque devis (déjà rattaché à un fournisseur via
-- quote_request_suppliers) porte désormais un prix unitaire par article de la demande. À la
-- sélection du devis, ces prix deviennent le prix_unitaire_final des lignes (plus de répartition
-- à parts égales du montant global). Additif : les anciens devis sans détail conservent l'ancien
-- comportement (répartition), le nouveau chemin ne s'applique que si des quote_lines existent.
CREATE TABLE IF NOT EXISTS quote_lines (
  id                        SERIAL PRIMARY KEY,
  quote_id                  INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  purchase_request_line_id  INTEGER NOT NULL REFERENCES purchase_request_lines(id) ON DELETE CASCADE,
  prix_unitaire             NUMERIC(16, 2) NOT NULL DEFAULT 0,
  UNIQUE (quote_id, purchase_request_line_id)
);
CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_lines(quote_id);
