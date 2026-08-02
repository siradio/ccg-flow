-- Le module KPI devient sous-modulé (kpi.achats / kpi.rh / kpi.stock) au lieu d'un seul bloc
-- "kpi" tout-ou-rien — voir backend/src/config/modules.js. Fan-out des accès déjà accordés vers
-- les trois nouvelles clés, même niveau conservé, pour ne retirer aucun droit existant.
INSERT INTO user_sub_module_access (user_id, sub_module_key, niveau, updated_at)
SELECT user_id, 'kpi.achats', niveau, now() FROM user_sub_module_access WHERE sub_module_key = 'kpi'
UNION ALL
SELECT user_id, 'kpi.rh', niveau, now() FROM user_sub_module_access WHERE sub_module_key = 'kpi'
UNION ALL
SELECT user_id, 'kpi.stock', niveau, now() FROM user_sub_module_access WHERE sub_module_key = 'kpi';

DELETE FROM user_sub_module_access WHERE sub_module_key = 'kpi';
