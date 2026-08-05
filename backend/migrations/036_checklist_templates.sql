-- Module Logistique — Checklists chauffeurs : MODÈLES configurables. Un modèle (ex. « Contrôle
-- départ camion ») porte un type et une liste d'items ordonnés (niveaux, pneus, freins, papiers…).
-- Les réalisations (remplissage par le chauffeur) viendront dans un incrément suivant et
-- référenceront ces modèles. Données structurées (item = ligne) pour une exploitation/IA future.
CREATE TABLE IF NOT EXISTS checklist_templates (
  id         SERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'Départ',   -- Départ | Retour | Hebdomadaire | Autre
  actif      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_template_items (
  id          SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  libelle     TEXT NOT NULL,
  ordre       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_template ON checklist_template_items(template_id);
