-- Code fournisseur interne (ex. FRN-001), repris du fichier Excel de suivi (SPEC.md §1.1) — sert
-- de clé de rapprochement idempotente pour l'import (backend/scripts/import-suppliers.js).
-- NULL autorisé (fournisseurs saisis directement dans l'app, sans code externe) ; UNIQUE n'exclut
-- que les doublons de code réel (Postgres traite chaque NULL comme distinct).
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;
