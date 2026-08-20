-- Accès en LECTURE SEULE (niveau « consultation ») au Parc véhicule (logistique.parc) pour TOUS les
-- utilisateurs existants. Le droit d'édition reste accordé individuellement.
-- ON CONFLICT DO NOTHING : n'écrase JAMAIS un niveau déjà accordé — un utilisateur qui a déjà
-- « ajout » ou « edition » conserve son niveau (pas de rétrogradation).
INSERT INTO user_sub_module_access (user_id, sub_module_key, niveau)
SELECT id, 'logistique.parc', 'consultation' FROM users
ON CONFLICT (user_id, sub_module_key) DO NOTHING;
