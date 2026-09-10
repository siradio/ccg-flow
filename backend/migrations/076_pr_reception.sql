-- Réception de commande : le demandeur confirme, une fois le bon de commande généré, que la
-- marchandise a bien été reçue (+ commentaire facultatif). Permet aux achats de suivre le taux
-- de réception. N'altère pas le workflow (statut inchangé), c'est un marqueur additionnel.
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS receptionnee BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reception_commentaire TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reception_at TIMESTAMPTZ;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reception_by INTEGER REFERENCES users(id);
