import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';

// Premier niveau de navigation du module Stock : deux sections indépendantes, chacune avec ses
// propres sous-onglets (voir StockSubnav.jsx pour Stock du Jour) — Mouvement Stock (§3.9 SPEC.md)
// est volontairement minimal pour l'instant, base posée mais pas finalisée. Chaque onglet est
// désormais conditionné à son propre sous-module (§2.3) : les deux sont accordables
// indépendamment depuis la refonte du système de permissions.
const MOUVEMENT_PREFIX = '/stock/mouvements';

export default function StockSectionNav() {
  const { user } = useAuth();
  const location = useLocation();
  const mouvementActive = location.pathname.startsWith(MOUVEMENT_PREFIX);
  const referentielsActive = location.pathname.startsWith('/stock/referentiels');
  const stockDuJourActive = location.pathname.startsWith('/stock/') && !mouvementActive && !referentielsActive;

  return (
    <nav className="subnav">
      {hasSubModuleLevel(user, 'stock.saisie_jour') && (
        <NavLink to="/stock/saisie" className={() => (stockDuJourActive ? 'active' : undefined)}>Stock du Jour</NavLink>
      )}
      {hasSubModuleLevel(user, 'stock.mouvements') && (
        <NavLink to={MOUVEMENT_PREFIX} className={() => (mouvementActive ? 'active' : undefined)}>Mouvement Stock</NavLink>
      )}
      {hasSubModuleLevel(user, 'stock.referentiels') && (
        <NavLink to="/stock/referentiels" className={() => (referentielsActive ? 'active' : undefined)}>Référentiels Stock</NavLink>
      )}
    </nav>
  );
}
