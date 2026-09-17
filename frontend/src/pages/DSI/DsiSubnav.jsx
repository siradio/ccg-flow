import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Sous-navigation DSI. Onglets « staff » gâtés par sous-module ; onglets self-service (Mon matériel,
// et plus tard Signaler un incident / Mes tickets) ouverts à tout salarié. Les sections s'ajoutent
// au fil des lots.
const STAFF_TABS = [
  { to: '/dsi/tableau-bord', sub: 'dsi.dashboard', key: 'dsi.nav.dashboard' },
  { to: '/dsi/parc', sub: 'dsi.parc', key: 'dsi.nav.parc' },
  { to: '/dsi/affectations', sub: 'dsi.affectations', key: 'dsi.nav.affectations' },
  { to: '/dsi/tickets', sub: 'dsi.tickets', key: 'dsi.nav.tickets' },
  { to: '/dsi/maintenance', sub: 'dsi.maintenance', key: 'dsi.nav.maintenance' },
  { to: '/dsi/activites', sub: 'dsi.activites', key: 'dsi.nav.activites' },
  { to: '/dsi/projets', sub: 'dsi.projets', key: 'dsi.nav.projets' },
  { to: '/dsi/risques', sub: 'dsi.risques', key: 'dsi.nav.risques' },
  { to: '/dsi/rapports', sub: 'dsi.rapports', key: 'dsi.nav.rapports' },
  { to: '/dsi/referentiels', sub: 'dsi.referentiels', key: 'dsi.nav.referentiels' },
];
const SELF_TABS = [
  { to: '/dsi/signaler', key: 'dsi.nav.report' },
  { to: '/dsi/mes-tickets', key: 'dsi.nav.myTickets' },
  { to: '/dsi/mon-materiel', key: 'dsi.nav.myEquipment' },
];

export default function DsiSubnav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const staff = STAFF_TABS.filter(x => hasSubModuleLevel(user, x.sub));
  return (
    <nav className="subnav">
      {staff.map(x => <NavLink key={x.to} to={x.to} className={({ isActive }) => isActive ? 'active' : undefined}>{t(x.key)}</NavLink>)}
      {SELF_TABS.map(x => <NavLink key={x.to} to={x.to} className={({ isActive }) => isActive ? 'active' : undefined}>{t(x.key)}</NavLink>)}
    </nav>
  );
}

// Première destination DSI : section staff accessible sinon l'espace self-service.
export function firstDsiTarget(user) {
  for (const x of STAFF_TABS) if (hasSubModuleLevel(user, x.sub)) return x.to;
  return '/dsi/mon-materiel';
}
