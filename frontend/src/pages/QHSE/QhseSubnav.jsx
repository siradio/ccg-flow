import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Sous-navigation QHSE. Lot 0 = Référentiels du laboratoire. Les sections (Analyses, Échantillonnage,
// Contrôles, Non-conformités, Libération, Expédition, Tableau de bord) s'ajoutent au fil des lots.
const TABS = [
  { to: '/qhse/tableau-de-bord', sub: 'qhse.dashboard', key: 'qhse.nav.dashboard' },
  { to: '/qhse/analyses', sub: 'qhse.labo', key: 'qhse.nav.analyses' },
  { to: '/qhse/production', sub: 'qhse.production', key: 'qhse.nav.production' },
  { to: '/qhse/echantillonnage', sub: 'qhse.sampling', key: 'qhse.nav.sampling' },
  { to: '/qhse/expeditions', sub: 'qhse.expeditions', key: 'qhse.nav.expeditions' },
  { to: '/qhse/non-conformites', sub: 'qhse.nc', key: 'qhse.nav.nc' },
  { to: '/qhse/liberation', sub: 'qhse.liberation', key: 'qhse.nav.liberation' },
  { to: '/qhse/reclamations', sub: 'qhse.complaints', key: 'qhse.nav.complaints' },
  { to: '/qhse/fournisseurs', sub: 'qhse.supplier_eval', key: 'qhse.nav.supplierEval' },
  { to: '/qhse/referentiels', sub: 'qhse.referentiels', key: 'qhse.nav.referentiels' },
];

export default function QhseSubnav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const tabs = TABS.filter(x => hasSubModuleLevel(user, x.sub));
  return (
    <nav className="subnav">
      {tabs.map(x => <NavLink key={x.to} to={x.to} className={({ isActive }) => isActive ? 'active' : undefined}>{t(x.key)}</NavLink>)}
    </nav>
  );
}

// Première destination QHSE accessible.
export function firstQhseTarget(user) {
  for (const x of TABS) if (hasSubModuleLevel(user, x.sub)) return x.to;
  return null;
}
