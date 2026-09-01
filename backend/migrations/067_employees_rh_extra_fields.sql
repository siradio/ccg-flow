-- Champs RH complémentaires sur les employés (additif, idempotent, sans impact sur l'existant).
-- Suivi facilité : date de naissance, nationalité, n° CNSS, situation familiale, contact d'urgence
-- (nom + téléphone), permis de travail (oui/non) et sa date d'expiration.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_naissance DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationalite TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS numero_cnss TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS situation_familiale TEXT; -- liste côté UI (Célibataire/Marié(e)/Divorcé(e)/Veuf(ve))
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contact_urgence_nom TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contact_urgence_tel TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS permis_travail BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS permis_travail_expiration DATE;
