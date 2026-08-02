import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { REFERENTIAL_NAV } from './ReferentialsIndex';

// Partagée entre ReferentialsIndex (onglets referentiels.*) et Employees/ListPage (onglet
// "Employés", sous-module `rh`) pour que les deux vivent visuellement sous la même barre
// d'onglets, même si `rh` reste un sous-module indépendant de `referentiels.*` (§2.3 SPEC.md).
export default function ReferentialsSubnav() {
  const { user } = useAuth();
  const showEmployeesTab = hasSubModuleLevel(user, 'rh');
  const showPricesTab = hasSubModuleLevel(user, 'referentiels.prix');
  const allowedNav = REFERENTIAL_NAV.filter(([, , subModuleKey]) => hasSubModuleLevel(user, subModuleKey));

  return (
    <nav className="subnav">
      {showEmployeesTab && <NavLink to="/employees" className={({ isActive }) => isActive ? 'active' : undefined}>Employés</NavLink>}
      {showPricesTab && <NavLink to="/prices/historique" className={({ isActive }) => isActive ? 'active' : undefined}>Prix</NavLink>}
      {allowedNav.map(([key, label]) => (
        <NavLink key={key} to={`/referentials/${key}`} className={({ isActive }) => isActive ? 'active' : undefined}>{label}</NavLink>
      ))}
    </nav>
  );
}
