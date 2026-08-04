-- Branding par entité pour les documents générés (demande de devis, bon de commande) :
-- logo d'entête, signature et cachet/tampon, chacun propre à l'entité (CCG, Soguipal, PBIC).
-- Stockés en base (BYTEA) comme les pièces jointes, avec leur type MIME pour l'aperçu.
ALTER TABLE entities
  ADD COLUMN logo BYTEA,
  ADD COLUMN logo_mime TEXT,
  ADD COLUMN signature BYTEA,
  ADD COLUMN signature_mime TEXT,
  ADD COLUMN stamp BYTEA,
  ADD COLUMN stamp_mime TEXT;
