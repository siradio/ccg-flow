-- Corrige l'ordre d'affichage des deux premières étapes du circuit « demande d'achat ».
-- Le demandeur SOUMET d'abord, PUIS l'expression de besoin est validée. La migration 014 les
-- avait placées dans l'ordre inverse (expression_besoin=1, soumission=2).
-- Échange sans collision avec la contrainte UNIQUE(workflow_template_id, ordre) : on gare d'abord
-- « soumission » sur un ordre libre, puis on repositionne. S'applique à toutes les versions de
-- circuit (workflow_steps par template).
UPDATE workflow_steps SET ordre = -1 WHERE code = 'soumission';
UPDATE workflow_steps SET ordre = 2  WHERE code = 'expression_besoin';
UPDATE workflow_steps SET ordre = 1  WHERE code = 'soumission';
