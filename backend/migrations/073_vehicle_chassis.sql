-- Parc de véhicules : ajout du numéro de châssis (VIN), saisi librement.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS numero_chassis TEXT;
