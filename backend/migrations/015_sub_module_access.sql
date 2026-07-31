-- Unifie user_module_access (binaire) + user_prix_access (niveau, spécifique Prix) en une seule
-- table générique Module → Sous-module → Niveau (SPEC.md §2.3) : jusqu'ici Stock du Jour et
-- Mouvement Stock partageaient la même clé "stock", impossible d'accorder l'un sans l'autre.
-- Coupure nette (pas de compat descendante) : la prod n'a pas encore basculé, peu de vrais
-- utilisateurs à ce jour — c'est le bon moment.
CREATE TABLE user_sub_module_access (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sub_module_key TEXT NOT NULL,
  niveau TEXT NOT NULL CHECK (niveau IN ('consultation', 'ajout', 'edition')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sub_module_key)
);
CREATE INDEX idx_user_sub_module_access_user ON user_sub_module_access(user_id);

-- Migration des octrois existants — accès binaire d'avant = niveau 'edition' (accès complet).
-- "stock" part en fan-out vers les deux nouveaux sous-modules indépendants.
INSERT INTO user_sub_module_access (user_id, sub_module_key, niveau)
SELECT user_id,
  CASE module_key
    WHEN 'ref_entities' THEN 'referentiels.entities'
    WHEN 'ref_sites' THEN 'referentiels.sites'
    WHEN 'ref_warehouses' THEN 'referentiels.warehouses'
    WHEN 'ref_machines' THEN 'referentiels.machines'
    WHEN 'ref_products' THEN 'referentiels.products'
    WHEN 'ref_product_categories' THEN 'referentiels.product_categories'
    WHEN 'ref_business_units' THEN 'referentiels.business_units'
    WHEN 'ref_suppliers' THEN 'referentiels.suppliers'
    ELSE module_key -- achats, rh, kpi, prix (sera écrasé ci-dessous par user_prix_access le cas échéant) restent identiques
  END,
  'edition'
FROM user_module_access
WHERE module_key <> 'stock'
ON CONFLICT (user_id, sub_module_key) DO NOTHING;

INSERT INTO user_sub_module_access (user_id, sub_module_key, niveau)
SELECT user_id, 'stock.saisie_jour', 'edition' FROM user_module_access WHERE module_key = 'stock'
ON CONFLICT (user_id, sub_module_key) DO NOTHING;

INSERT INTO user_sub_module_access (user_id, sub_module_key, niveau)
SELECT user_id, 'stock.mouvements', 'edition' FROM user_module_access WHERE module_key = 'stock'
ON CONFLICT (user_id, sub_module_key) DO NOTHING;

-- Le niveau réel de Prix (déjà fin) écrase le 'edition' générique posé ci-dessus si l'utilisateur
-- avait le module 'prix' sans avoir explicitement de ligne user_prix_access (edge case improbable
-- mais couvert) ; sinon insère simplement le niveau existant.
INSERT INTO user_sub_module_access (user_id, sub_module_key, niveau)
SELECT user_id, 'prix', niveau FROM user_prix_access
ON CONFLICT (user_id, sub_module_key) DO UPDATE SET niveau = EXCLUDED.niveau;

DROP TABLE user_module_access;
DROP TABLE user_prix_access;
