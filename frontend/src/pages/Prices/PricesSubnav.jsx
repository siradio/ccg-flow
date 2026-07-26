import { NavLink } from 'react-router-dom';

export default function PricesSubnav() {
  return (
    <nav className="subnav">
      <NavLink to="/prices/historique" className={({ isActive }) => isActive ? 'active' : undefined}>Historique</NavLink>
      <NavLink to="/prices/graphique" className={({ isActive }) => isActive ? 'active' : undefined}>Graphique</NavLink>
    </nav>
  );
}
