-- Autorise plusieurs workflow_templates pour le même module_code (une version active à la fois,
-- des versions archivées à côté) : quand un admin supprime une étape déjà utilisée par au moins
-- une demande d'achat, l'ancien template est figé (actif = false) et une nouvelle version active
-- est créée — les demandes déjà engagées restent sur l'ancien circuit exactement tel quel (mêmes
-- id de workflow_steps, donc mêmes FK approvals/current_step_id), les nouvelles demandes utilisent
-- le nouveau. Voir workflow.routes.js.
ALTER TABLE workflow_templates DROP CONSTRAINT workflow_templates_module_code_key;
CREATE UNIQUE INDEX workflow_templates_module_code_actif_uidx
  ON workflow_templates (module_code) WHERE actif = true;
