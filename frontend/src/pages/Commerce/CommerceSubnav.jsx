import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Sous-navigation du module Commerce. Phase D = référentiels & affectations ; les onglets
// Tableau de bord / Versements / Objectifs / Commissions / Rapports arriveront en Phase F/G.
// [chemin, clé i18n, sous-module]
export const NAV = [
  ['/commerce/tableau-bord', 'com.nav.dashboard', 'commerce.tableau_bord'],
  ['/commerce/versements', 'com.nav.versements', 'commerce.versements'],
  ['/commerce/objectifs', 'com.nav.objectifs', 'commerce.objectifs'],
  ['/commerce/commerciaux', 'com.nav.commerciaux', 'commerce.commerciaux'],
  ['/commerce/affectations', 'com.nav.affectations', 'commerce.commerciaux'],
  ['/commerce/moyens', 'com.nav.moyens', 'commerce.parametres'],
  ['/commerce/banques', 'com.nav.banques', 'commerce.parametres'],
  ['/commerce/zones', 'com.nav.zones', 'commerce.parametres'],
  ['/commerce/parametres', 'com.nav.parametres', 'commerce.parametres'],
];

// Premier onglet auquel l'utilisateur a accès (pour la redirection par défaut).
export function firstCommerceTarget(user) {
  const first = NAV.find(([, , sub]) => hasSubModuleLevel(user, sub));
  return first ? first[0] : null;
}

export default function CommerceSubnav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const allowed = NAV.filter(([, , sub]) => hasSubModuleLevel(user, sub));
  return (
    <nav className="subnav">
      {allowed.map(([to, labelKey]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => isActive ? 'active' : undefined}>{t(labelKey)}</NavLink>
      ))}
    </nav>
  );
}
