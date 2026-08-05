-- Refonte Stock (Lot 0) — Référentiel des types de mouvement. Chaque type porte son IMPACT :
--   sens : 'entree' (+ stock), 'sortie' (− stock), 'neutre' (contrôle/transfert, pas d'impact direct
--          sur le stock disponible d'une localisation ; le transfert génère 2 mouvements).
--   requiert_validation   : le mouvement passe par le workflow avant d'impacter le stock.
--   requiert_justificatif : une pièce jointe est obligatoire.
-- L'utilisateur saisit TOUJOURS une quantité positive ; c'est le sens qui détermine +/−.
CREATE TABLE IF NOT EXISTS stock_movement_types (
  id                    SERIAL PRIMARY KEY,
  code                  TEXT NOT NULL UNIQUE,
  libelle               TEXT NOT NULL,
  sens                  TEXT NOT NULL DEFAULT 'sortie' CHECK (sens IN ('entree', 'sortie', 'neutre')),
  requiert_validation   BOOLEAN NOT NULL DEFAULT false,
  requiert_justificatif BOOLEAN NOT NULL DEFAULT false,
  actif                 BOOLEAN NOT NULL DEFAULT true,
  ordre                 INTEGER NOT NULL DEFAULT 100,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO stock_movement_types (code, libelle, sens, requiert_validation, requiert_justificatif, ordre) VALUES
  ('stock_initial',        'Stock initial',            'entree', false, false, 1),
  ('entree',               'Entrée',                   'entree', false, false, 10),
  ('reception_fournisseur','Réception fournisseur',    'entree', false, false, 11),
  ('retour_client',        'Retour client',            'entree', false, false, 12),
  ('production',           'Production (entrée PF)',    'entree', false, false, 13),
  ('reintegration',        'Réintégration',            'entree', false, true,  14),
  ('ajustement_positif',   'Ajustement positif',       'entree', true,  true,  15),
  ('sortie_quarantaine',   'Sortie de quarantaine',    'entree', true,  false, 16),
  ('sortie',               'Sortie',                   'sortie', false, false, 30),
  ('promo',                'Promo',                    'sortie', false, false, 31),
  ('don',                  'Don',                      'sortie', true,  true,  32),
  ('retour_fournisseur',   'Retour fournisseur',       'sortie', true,  false, 33),
  ('consommation_interne', 'Consommation interne',     'sortie', false, false, 34),
  ('consommation_production','Consommation en production','sortie', false, false, 35),
  ('destruction',          'Destruction',              'sortie', true,  true,  36),
  ('perte',                'Perte',                    'sortie', true,  true,  37),
  ('casse',                'Casse',                    'sortie', true,  true,  38),
  ('echantillon',          'Échantillon',              'sortie', false, false, 39),
  ('ajustement_negatif',   'Ajustement négatif',       'sortie', true,  true,  40),
  ('mise_quarantaine',     'Mise en quarantaine',      'sortie', true,  false, 41),
  ('non_conforme',         'Non conforme',             'sortie', true,  true,  42),
  ('transfert',            'Transfert',                'neutre', false, false, 60),
  ('controle_qualite',     'Contrôle qualité',         'neutre', false, false, 61),
  ('inventaire',           'Inventaire',               'neutre', false, false, 62)
ON CONFLICT (code) DO NOTHING;
