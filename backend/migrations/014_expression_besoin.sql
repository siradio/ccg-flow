-- Ajoute une étape "expression de besoin" validée par la DGA AVANT que le Service Achat ne
-- commence à consulter des fournisseurs (SPEC.md §3.1/§3.2) — évite au Service Achat de
-- travailler des devis pour une dépense qui sera finalement refusée.
ALTER TABLE purchase_requests DROP CONSTRAINT purchase_requests_status_check;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check CHECK (status IN (
  'brouillon', 'en_attente_validation_besoin', 'soumise', 'en_analyse_achat', 'devis_en_cours',
  'devis_selectionne', 'en_validation', 'validee', 'rejetee', 'bon_commande_genere'
));

-- Décale l'ordre des étapes existantes de +1, une par une en partant de la fin, pour ne jamais
-- entrer en collision avec UNIQUE(workflow_template_id, ordre) en cours de route.
UPDATE workflow_steps SET ordre = 9 WHERE code = 'generation_bc';
UPDATE workflow_steps SET ordre = 8 WHERE code = 'dga';
UPDATE workflow_steps SET ordre = 7 WHERE code = 'finances';
UPDATE workflow_steps SET ordre = 6 WHERE code = 'controle_gestion';
UPDATE workflow_steps SET ordre = 5 WHERE code = 'validation_achat';
UPDATE workflow_steps SET ordre = 4 WHERE code = 'devis';
UPDATE workflow_steps SET ordre = 3 WHERE code = 'analyse_achat';
UPDATE workflow_steps SET ordre = 2 WHERE code = 'soumission';

-- Étape décorative (comme soumission/analyse_achat/devis) : sert à l'affichage
-- (WorkflowTimeline/WorkflowConfig), la vraie logique de validation vit dans
-- purchase-requests.service.js (nouveau statut en_attente_validation_besoin), pas dans le
-- moteur générique workflow.engine.js — pas de comportement_si_refus car géré par du code
-- dédié, pas par le mécanisme générique de retour_step_code.
INSERT INTO workflow_steps
  (workflow_template_id, ordre, code, nom, role_code_requis, commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code)
SELECT id, 1, 'expression_besoin', 'Validation de l''expression de besoin (DGA)', 'dga', true, null, null
FROM workflow_templates WHERE module_code = 'demande_achat';
