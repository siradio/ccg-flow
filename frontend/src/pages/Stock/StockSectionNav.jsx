import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';

// Navigation du module Stock. Refonte (grand livre) : les écrans du nouveau module d'abord, puis
// les anciens écrans (Stock du Jour / Mouvement Stock) conservés le temps de la migration.
const NAV = [
  ['/stock/tableau-bord', 'Tableau de bord', 'stock.tableau_bord'],
  ['/stock/saisie-mouvement', 'Saisie produit fini', 'stock.saisie'],
  ['/stock/saisie-mp', 'Saisie matière première', 'stock.saisie'],
  ['/stock/journal', 'Mouvements', 'stock.consultation'],
  ['/stock/etat', 'Stock actuel', 'stock.consultation'],
  ['/stock/lots', 'Lots', 'stock.consultation'],
  ['/stock/transferts', 'Transferts', 'stock.transferts'],
  ['/stock/inventaires', 'Inventaires', 'stock.inventaires'],
  ['/stock/valorisation', 'Valorisation', 'stock.valorisation'],
  ['/stock/import', 'Import', 'stock.import'],
  ['/stock/referentiels', 'Référentiels', 'stock.referentiels'],
  // Anciens écrans — retirés en fin de refonte.
  ['/stock/saisie', 'Stock du Jour (ancien)', 'stock.saisie_jour'],
  ['/stock/mouvements', 'Mouvement Stock (ancien)', 'stock.mouvements'],
];

export default function StockSectionNav() {
  const { user } = useAuth();
  const allowed = NAV.filter(([, , sub]) => hasSubModuleLevel(user, sub));
  return (
    <nav className="subnav">
      {allowed.map(([to, label]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? 'active' : undefined)}>{label}</NavLink>
      ))}
    </nav>
  );
}
