-- Suppression du module « Documents » : les fichiers étaient stockés en base (BYTEA), ce qui
-- alourdit le stockage. L'organisation passe désormais par « Liens utiles » (liens OneDrive).
-- ⚠️ DESTRUCTIF : supprime définitivement les documents téléversés. Assurez-vous d'avoir récupéré
-- ceux à conserver avant d'appliquer cette migration en production.
DROP TABLE IF EXISTS procedure_documents;
DROP TABLE IF EXISTS document_categories;
