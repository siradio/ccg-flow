-- Paramètres RH : jours accordés par défaut pour certains types de demande.
-- Ex. permissions exceptionnelles (Article 8 — événements familiaux) : mariage du salarié 3 j,
-- décès d'un conjoint 3 j, décès d'un ascendant 1 j… exprimés en jours ouvrables.
-- NULL = pas de forfait (la durée reste libre, définie par les dates de la demande).
ALTER TABLE rh_types ADD COLUMN IF NOT EXISTS jours_accordes INTEGER;
