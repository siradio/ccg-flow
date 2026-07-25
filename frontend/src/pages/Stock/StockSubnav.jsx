import { NavLink } from 'react-router-dom';

export default function StockSubnav() {
  return (
    <nav className="subnav">
      <NavLink to="/stock/saisie" className={({ isActive }) => isActive ? 'active' : undefined}>Saisie du jour</NavLink>
      <NavLink to="/stock/historique" className={({ isActive }) => isActive ? 'active' : undefined}>Historique</NavLink>
    </nav>
  );
}
