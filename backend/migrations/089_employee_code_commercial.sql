-- Code commercial sur la fiche employé (si l'employé est un commercial). Alimente le référentiel
-- Commerce : à la sélection d'un employé, le code commercial se pré-remplit depuis ce champ.
-- Distinct du matricule (code employé). NULL pour les employés non commerciaux.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS code_commercial TEXT;
