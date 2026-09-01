-- Étape DGA FINALE (après la validation Finances). Le bon de commande est généré dès la validation
-- Finances (comme avant), puis la demande passe en validation DGA (approuve → clôture ; refuse →
-- BC annulé + retour Finances). La logique vit dans purchase-requests.service.js (pilotée par le
-- statut en_validation_dga, comme l'expression de besoin), l'étape workflow_steps ci-dessous est
-- décorative (timeline / config) et NE change PAS le déclenchement du BC : generation_bc garde un
-- ordre inférieur, donc le moteur générique l'atteint toujours en premier.

-- 1) Nouveau statut en_validation_dga.
ALTER TABLE purchase_requests DROP CONSTRAINT purchase_requests_status_check;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check CHECK (status IN (
  'brouillon', 'en_attente_validation_besoin', 'soumise', 'en_analyse_achat', 'devis_en_cours',
  'devis_selectionne', 'en_validation', 'en_validation_dga', 'validee', 'rejetee', 'bon_commande_genere'
));

-- 2) Étape décorative validation_dga, insérée APRÈS toutes les autres (ordre = max + 1), idempotente.
INSERT INTO workflow_steps
  (workflow_template_id, ordre, code, nom, role_code_requis, commentaire_obligatoire_si_refus, comportement_si_refus, retour_step_code)
SELECT wt.id, COALESCE(MAX(ws.ordre), 0) + 1, 'validation_dga', 'Validation DGA (après Finances)',
       'validateur_besoin', true, 'retour_etape_precedente', 'finances'
FROM workflow_templates wt
LEFT JOIN workflow_steps ws ON ws.workflow_template_id = wt.id
WHERE wt.module_code = 'demande_achat'
GROUP BY wt.id
ON CONFLICT (workflow_template_id, code) DO NOTHING;
