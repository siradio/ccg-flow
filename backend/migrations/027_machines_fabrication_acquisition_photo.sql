-- Enrichissement du référentiel Machines : dates de fabrication et d'acquisition, et photo de la
-- machine. La photo suit le même stockage que le branding des entités (022) : octets en BYTEA
-- directement sur la ligne + type MIME, plutôt que sur le système de fichiers (éphémère sur Azure
-- App Service). Les colonnes photo NE sont volontairement PAS exposées par le CRUD JSON générique
-- (elles transiteraient à chaque chargement de liste) : elles passent par des routes dédiées.
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS date_fabrication DATE,
  ADD COLUMN IF NOT EXISTS date_acquisition DATE,
  ADD COLUMN IF NOT EXISTS photo BYTEA,
  ADD COLUMN IF NOT EXISTS photo_mime TEXT;
