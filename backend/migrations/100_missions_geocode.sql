-- Module Logistique — géolocalisation des missions. Les champs depart/arrivee sont du texte libre
-- (noms de lieux) : pour afficher les missions sur la carte, on met en cache les coordonnées
-- géocodées (via Nominatim/OSM, côté serveur) afin de ne pas re-géocoder à chaque chargement.
-- geocoded_at horodate le dernier géocodage ; depart_label/arrivee_label mémorisent le TEXTE SOURCE
-- géocodé, pour re-géocoder automatiquement quand le lieu saisi change (sinon les coords restent figées).
ALTER TABLE missions ADD COLUMN IF NOT EXISTS depart_lat     NUMERIC(9,6);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS depart_lng     NUMERIC(9,6);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS arrivee_lat    NUMERIC(9,6);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS arrivee_lng    NUMERIC(9,6);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS depart_label   TEXT;   -- texte source géocodé (pour détecter un changement)
ALTER TABLE missions ADD COLUMN IF NOT EXISTS arrivee_label  TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS geocoded_at    TIMESTAMPTZ;
