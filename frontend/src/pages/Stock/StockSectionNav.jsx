import { NavLink, useLocation } from 'react-router-dom';

// Premier niveau de navigation du module Stock : deux sections indépendantes, chacune avec ses
// propres sous-onglets (voir StockSubnav.jsx pour Stock du Jour) — Mouvement Stock (§3.9 SPEC.md)
// est volontairement minimal pour l'instant, base posée mais pas finalisée.
const MOUVEMENT_PREFIX = '/stock/mouvements';

export default function StockSectionNav() {
  const location = useLocation();
  const mouvementActive = location.pathname.startsWith(MOUVEMENT_PREFIX);
  const stockDuJourActive = location.pathname.startsWith('/stock/') && !mouvementActive;

  return (
    <nav className="subnav">
      <NavLink to="/stock/saisie" className={() => (stockDuJourActive ? 'active' : undefined)}>Stock du Jour</NavLink>
      <NavLink to={MOUVEMENT_PREFIX} className={() => (mouvementActive ? 'active' : undefined)}>Mouvement Stock</NavLink>
    </nav>
  );
}
