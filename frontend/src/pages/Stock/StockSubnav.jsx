import { NavLink } from 'react-router-dom';

export default function StockSubnav() {
  return (
    <nav className="subnav">
      <NavLink to="/stock/saisie" className={({ isActive }) => isActive ? 'active' : undefined}>Saisie du jour</NavLink>
      <NavLink to="/stock/historique" className={({ isActive }) => isActive ? 'active' : undefined}>Historique</NavLink>
      <NavLink to="/stock/graphiques" className={({ isActive }) => isActive ? 'active' : undefined}>Graphiques</NavLink>
      <NavLink to="/stock/dashboard-dg" className={({ isActive }) => isActive ? 'active' : undefined}>Dashboard DG</NavLink>
    </nav>
  );
}
