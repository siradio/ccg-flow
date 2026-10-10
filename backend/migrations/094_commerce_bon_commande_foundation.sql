-- Module Commerce → Bons de commande commerciaux — Lot 0 (fondations).
-- Additif et idempotent. Ne crée AUCUN écran et ne modifie AUCUN comportement visible :
-- pose uniquement le socle (rôles, circuit de validation, capacités véhicule, lien commercial↔véhicule,
-- paramètre de seuil de remplissage) pour les lots suivants. Les tables métier (commandes, lignes,
-- tarifs, grossistes, validations, contrôle stock, documents, historique) viendront aux lots L1–L3.

-- 1) Rôles de validation du bon de commande commercial.
--    `controle_gestion` existe déjà (circuit Achats). On ajoute :
--      - responsable_commercial : CROSS-BU / global (non rattaché à une BU) ; une validation suffit.
--      - gestionnaire_stock     : vérification manuelle de disponibilité, en éventail par BU.
ALTER TABLE user_entity_roles DROP CONSTRAINT IF EXISTS user_entity_roles_role_code_check;
ALTER TABLE user_entity_roles ADD CONSTRAINT user_entity_roles_role_code_check
  CHECK (role_code IN (
    'super_admin','demandeur','service_achat','controle_gestion','finances','validateur_besoin',
    'support_it','observateur_achats','rh','responsable','daf','dg',
    'responsable_commercial','gestionnaire_stock'
  ));

-- 2) Circuit de validation (réutilise le moteur générique, sans le modifier).
--    3 étapes métier + 1 étape système (génération du bon de commande).
-- NB : depuis la migration 016, l'unicité de module_code est un index PARTIEL (WHERE actif),
-- il n'y a donc plus de contrainte totale à cibler → ON CONFLICT DO NOTHING sans cible
-- (couvre l'index partiel et reste idempotent : un 2e template actif du même module est ignoré).
INSERT INTO workflow_templates (module_code, nom, actif)
VALUES ('bon_commande_commercial', 'Bon de commande commercial', true)
ON CONFLICT DO NOTHING;

INSERT INTO workflow_steps
  (workflow_template_id, ordre, code, nom, role_code_requis,
   commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code)
SELECT t.id, v.ordre, v.code, v.nom, v.role,
       v.comm_oblig, v.comportement, v.retour
FROM workflow_templates t
CROSS JOIN (VALUES
  (1, 'validation_resp_commercial', 'Validation responsable commercial', 'responsable_commercial', true,  'annulation',              NULL),
  (2, 'controle_gestion',           'Contrôle de gestion',               'controle_gestion',        true,  'retour_etape_precedente', 'validation_resp_commercial'),
  (3, 'controle_stock',             'Contrôle stock (par BU)',           'gestionnaire_stock',      true,  'retour_etape_precedente', 'controle_gestion'),
  (4, 'generation_bc',              'Génération du bon de commande',     NULL,                      false, NULL,                      NULL)
) AS v(ordre, code, nom, role, comm_oblig, comportement, retour)
WHERE t.module_code = 'bon_commande_commercial'
ON CONFLICT (workflow_template_id, code) DO NOTHING;

-- 3) Capacité de charge des véhicules (la table `vehicles` n'avait que `capacite_reservoir` =
--    carburant). Deux unités distinctes : casiers (bons Yaourt) et cartons (bons Divers).
--    Colonnes posées maintenant ; champs éditables câblés au Lot 1 (référentiel Parc).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS capacite_casiers INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS capacite_cartons INTEGER;

-- 4) Véhicule habituel d'un commercial : pré-remplit le bon et affiche la capacité automatiquement.
ALTER TABLE commerciaux ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_commerciaux_vehicle ON commerciaux(vehicle_id);

-- 5) Seuil de remplissage minimal (en %) : en dessous, le bon exige un motif (sous-charge).
--    Paramètre global réutilisant la table clé/valeur existante ; surchargeable par BU plus tard.
INSERT INTO commerce_settings (business_unit_id, cle, valeur)
VALUES (NULL, 'bc_remplissage_seuil', '100')
ON CONFLICT DO NOTHING;
