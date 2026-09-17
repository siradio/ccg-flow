import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Sous-navigation du module DSI. Chaque onglet n'apparaît que si l'utilisateur a le sous-module
// correspondant. Les sections sont ajoutées au fil des lots ; L0 = Référentiels.
const TABS = [
  { to: '/dsi/referentiels', sub: 'dsi.referentiels', key: 'dsi.nav.referentiels' },
];

export default function DsiSubnav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const visible = TABS.filter(x => hasSubModuleLevel(user, x.sub));
  if (visible.length <= 1) return null; // pas de sous-nav utile avec un seul onglet
  return (
    <nav className="subnav">
      {visible.map(x => (
        <NavLink key={x.to} to={x.to} className={({ isActive }) => isActive ? 'active' : undefined}>{t(x.key)}</NavLink>
      ))}
    </nav>
  );
}

// Première destination DSI accessible à l'utilisateur (pour la redirection depuis /dsi).
export function firstDsiTarget(user) {
  for (const x of TABS) if (hasSubModuleLevel(user, x.sub)) return x.to;
  return null;
}
