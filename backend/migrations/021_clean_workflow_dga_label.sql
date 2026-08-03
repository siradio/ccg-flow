-- Nettoie le libellé d'étape resté "Validation de l'expression de besoin (DGA)" après le renommage
-- du rôle "dga" -> "validateur_besoin" (migration 020, qui n'a mis à jour que role_code_requis, pas
-- le nom affiché inséré par la migration 014). Concerne toutes les versions du template (§3.2,
-- versionnement du workflow). Le suivi du workflow et l'écran Admin -> Workflow affichent désormais
-- "Validation de l'expression de besoin".
UPDATE workflow_steps
SET nom = 'Validation de l''expression de besoin'
WHERE code = 'expression_besoin' AND nom LIKE '%(DGA)%';
