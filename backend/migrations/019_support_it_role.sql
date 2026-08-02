-- Nouveau rôle "support_it" : peut gérer les utilisateurs (créer des comptes, leur assigner des
-- rôles et des accès aux modules) sans être super_admin — voir middleware/permissions.js
-- (isUserAdmin/requireUserAdmin) et users.routes.js. Global comme super_admin (pas rattaché à une
-- entité), donc entity_id NULL pour ce rôle aussi.
ALTER TABLE user_entity_roles DROP CONSTRAINT user_entity_roles_role_code_check;
ALTER TABLE user_entity_roles ADD CONSTRAINT user_entity_roles_role_code_check
  CHECK (role_code IN ('super_admin', 'demandeur', 'service_achat', 'controle_gestion', 'finances', 'dga', 'support_it'));
