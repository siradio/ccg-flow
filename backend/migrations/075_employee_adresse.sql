-- Fiche employé : ajout de l'adresse (récupérée notamment pour pré-remplir un commercial interne).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS adresse TEXT;
