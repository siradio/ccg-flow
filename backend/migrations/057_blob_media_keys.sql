-- Migration Blob : colonnes "clé" à côté de chaque BYTEA média.
-- Le binaire migre vers Azure Blob (container privé) ; la colonne <col>_key
-- stocke la clé du blob. Le BYTEA est conservé (nullable) pour compat ascendante
-- et rollback, puis vidé par le backfill une fois la clé posée.

-- Pièces jointes achats (le cheval de bataille)
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS content_key TEXT;
ALTER TABLE attachments ALTER COLUMN content DROP NOT NULL;

-- Branding entité (logo / signature / tampon)
ALTER TABLE entities ADD COLUMN IF NOT EXISTS logo_key TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS signature_key TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS stamp_key TEXT;

-- Photos 1-1
ALTER TABLE machines ADD COLUMN IF NOT EXISTS photo_key TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_key TEXT;
ALTER TABLE checklist_run_items ADD COLUMN IF NOT EXISTS photo_key TEXT;

-- Photos 1-N
ALTER TABLE panne_photos ADD COLUMN IF NOT EXISTS photo_key TEXT;
ALTER TABLE panne_photos ALTER COLUMN photo DROP NOT NULL;
ALTER TABLE accident_photos ADD COLUMN IF NOT EXISTS photo_key TEXT;
ALTER TABLE accident_photos ALTER COLUMN photo DROP NOT NULL;
