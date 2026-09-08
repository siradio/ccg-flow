-- Module RH — Lot 2 : solde de congés à acquisition mensuelle (2,5 j/mois par défaut).
-- Le droit se calcule = solde initial + 2,5 × mois complets écoulés depuis la date de référence
-- (date de solde si renseignée, sinon date d'embauche). Ces 2 champs, saisis par la RH, permettent
-- d'amorcer le système au lancement (report du solde existant) sans historiser le passé.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS conge_solde_initial NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS conge_solde_date DATE;
