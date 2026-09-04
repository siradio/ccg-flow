import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Un utilisateur détient-il l'un des rôles de validation / RH sur une entité ?
function hasAnyRole(user, codes) {
  return (user?.roles || []).some(r => codes.includes(r.role_code));
}
export function canValidateRh(user) { return hasAnyRole(user, ['responsable', 'rh', 'daf', 'dg', 'super_admin']); }
export function canSeeAllRh(user) { return hasAnyRole(user, ['rh', 'super_admin']); }

export default function RhSubnav() {
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <nav className="subnav">
      <NavLink to="/rh/mes-demandes" className={({ isActive }) => isActive ? 'active' : undefined}>{t('rh.nav.mine')}</NavLink>
      {canValidateRh(user) && <NavLink to="/rh/a-valider" className={({ isActive }) => isActive ? 'active' : undefined}>{t('rh.nav.pending')}</NavLink>}
      {canSeeAllRh(user) && <NavLink to="/rh/toutes" className={({ isActive }) => isActive ? 'active' : undefined}>{t('rh.nav.all')}</NavLink>}
    </nav>
  );
}
