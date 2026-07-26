import { NavLink, useLocation } from 'react-router-dom';

// Premier niveau de navigation du module Stock : pour l'instant seul "Stock du Jour" existe,
// mais un futur "Mouvement Stock" viendra s'ajouter ici en tant que section indépendante (avec
// ses propres sous-onglets), d'où cette navigation à deux niveaux préparée dès maintenant.
export default function StockSectionNav() {
  const location = useLocation();
  const stockDuJourActive = location.pathname.startsWith('/stock/');

  return (
    <nav className="subnav">
      <NavLink to="/stock/saisie" className={() => (stockDuJourActive ? 'active' : undefined)}>Stock du Jour</NavLink>
    </nav>
  );
}
