-- Le module "Historique des prix" devient un sous-module de "Référentiels" (voir
-- backend/src/config/modules.js) au lieu d'un module racine à part — préserve les accès déjà
-- accordés en renommant simplement la clé, sans perte de droits pour les utilisateurs existants.
UPDATE user_sub_module_access SET sub_module_key = 'referentiels.prix' WHERE sub_module_key = 'prix';
