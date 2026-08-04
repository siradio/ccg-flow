-- Profils d'accès réutilisables : un "modèle" nommé regroupant une photo complète des droits
-- (rôles workflow par entité + niveaux d'accès aux modules + accès Business Units), que l'admin
-- applique à n'importe quel utilisateur en un clic. Évite de reconstruire les mêmes droits à la
-- main pour chaque nouvel arrivant ayant le même poste.
--
-- Le contenu est stocké en JSONB (un seul enregistrement par profil, pas de jointures) sous la forme :
--   {
--     "roles":         [{ "role_code": "service_achat", "entity_id": 3 }, ...],   -- entity_id NULL = rôle global
--     "subModules":    [{ "key": "achats", "niveau": "edition" }, ...],
--     "businessUnits": [5, 8, ...]
--   }
-- Les valeurs sont concrètes (ids réels) : un profil est le plus souvent créé à partir d'un
-- utilisateur déjà bien paramétré ("Enregistrer comme profil"), puis rejoué tel quel.
CREATE TABLE IF NOT EXISTS access_profiles (
  id          SERIAL PRIMARY KEY,
  nom         TEXT NOT NULL UNIQUE,
  description TEXT,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
