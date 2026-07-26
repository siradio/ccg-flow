-- Niveau d'accès fin à l'intérieur du module `prix`, en plus de l'accès binaire à `user_module_access`.
-- Un seul niveau par utilisateur (pas une liste comme user_business_unit_access) : la hiérarchie
-- est stricte, edition >= ajout >= consultation. Absence de ligne = 'consultation' par défaut
-- (le plus restrictif) dès lors que le module `prix` est accordé.
CREATE TABLE IF NOT EXISTS user_prix_access (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  niveau TEXT NOT NULL DEFAULT 'consultation' CHECK (niveau IN ('consultation', 'ajout', 'edition')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
