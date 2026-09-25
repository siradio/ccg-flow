-- Session unique par utilisateur (« dernière connexion gagne »).
-- session_id est régénéré à chaque login et embarqué dans le JWT ; le middleware d'auth
-- refuse tout jeton dont la session_id ne correspond plus à celle stockée (l'ancienne session
-- est ainsi invalidée dès qu'une nouvelle connexion a lieu). NULL = aucune session enregistrée
-- (jetons émis avant cette fonction : tolérés jusqu'à expiration / prochaine connexion).
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_id TEXT;
