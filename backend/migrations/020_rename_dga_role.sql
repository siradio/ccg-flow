-- Renomme le rôle "dga" en "validateur_besoin" partout — intitulé plus parlant qui ne sous-entend
-- plus que le titulaire est littéralement le Directeur Général Adjoint : n'importe qui habilité à
-- valider une expression de besoin peut porter ce rôle (délégation possible en cas d'absence).
-- Les comptes ayant déjà le rôle "dga" le conservent automatiquement sous le nouveau nom.
ALTER TABLE user_entity_roles DROP CONSTRAINT user_entity_roles_role_code_check;
UPDATE user_entity_roles SET role_code = 'validateur_besoin' WHERE role_code = 'dga';
ALTER TABLE user_entity_roles ADD CONSTRAINT user_entity_roles_role_code_check
  CHECK (role_code IN ('super_admin', 'demandeur', 'service_achat', 'controle_gestion', 'finances', 'validateur_besoin', 'support_it'));

-- role_code_requis (workflow_steps) est un TEXT libre, pas de contrainte à ajuster — mais toutes
-- les étapes existantes (actives ET archivées par le versioning du workflow) doivent suivre le
-- même renommage pour rester cohérentes avec l'historique des demandes déjà traitées.
UPDATE workflow_steps SET role_code_requis = 'validateur_besoin' WHERE role_code_requis = 'dga';
