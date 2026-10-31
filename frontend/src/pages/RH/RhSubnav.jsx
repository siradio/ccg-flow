import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import GroupedSubnav from '../../components/GroupedSubnav';

// Un utilisateur détient-il l'un des rôles de validation / RH sur une entité ?
function hasAnyRole(user, codes) {
  return (user?.roles || []).some(r => codes.includes(r.role_code));
}
export function canValidateRh(user) { return hasAnyRole(user, ['responsable', 'rh', 'daf', 'dg', 'super_admin']); }
export function canSeeAllRh(user) { return hasAnyRole(user, ['rh', 'super_admin']); }
// Gestion des paramètres RH (types de demande) : réservée au RH et aux super_admin.
export function canManageRhTypes(user) { return hasAnyRole(user, ['rh', 'super_admin']); }

// Sous-navigation à 2 niveaux : Pilotage / Demandes / Évaluation / Configuration.
export default function RhSubnav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const groups = [
    { key: 'pilotage', label: t('rh.grp.pilotage'), items: [
      { to: '/rh/dashboard', label: t('rh.nav.dashboard'), visible: canValidateRh(user) },
    ] },
    { key: 'demandes', label: t('rh.grp.demandes'), items: [
      { to: '/rh/mes-demandes', label: t('rh.nav.mine') },
      { to: '/rh/a-valider', label: t('rh.nav.pending'), visible: canValidateRh(user) },
      { to: '/rh/toutes', label: t('rh.nav.all'), visible: canSeeAllRh(user) },
    ] },
    { key: 'evaluation', label: t('rh.grp.evaluation'), items: [
      { to: '/rh/evaluation/fiches', label: t('rh.nav.evaluations') },
      { to: '/rh/evaluation/campagnes', label: t('rh.nav.campagnes'), visible: canManageRhTypes(user) },
      { to: '/rh/evaluation/modeles', label: t('rh.nav.modeles'), visible: canValidateRh(user) },
      { to: '/rh/competences', label: t('rh.nav.competences'), visible: canManageRhTypes(user) },
    ] },
    { key: 'config', label: t('rh.grp.config'), items: [
      { to: '/rh/parametres', label: t('rh.nav.params'), visible: canManageRhTypes(user) },
      { to: '/employees', label: t('rh.nav.employees'), visible: canManageRhTypes(user) },
    ] },
  ];
  return <GroupedSubnav groups={groups} />;
}
