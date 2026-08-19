-- Nouveau rôle « observateur_achats » : lecture seule sur les demandes d'achat d'une (ou toutes) les
-- entités attribuées — voit l'ensemble des DA en cours, sans aucun droit d'action (il n'intervient
-- dans aucune étape du circuit). Il faut l'ajouter à la contrainte CHECK de role_code (comme lors de
-- l'ajout de support_it, migration 019).
ALTER TABLE user_entity_roles DROP CONSTRAINT user_entity_roles_role_code_check;
ALTER TABLE user_entity_roles ADD CONSTRAINT user_entity_roles_role_code_check
  CHECK (role_code IN ('super_admin', 'demandeur', 'service_achat', 'controle_gestion', 'finances', 'validateur_besoin', 'support_it', 'observateur_achats'));
