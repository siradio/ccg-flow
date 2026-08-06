import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Navigation du module Stock. Refonte (grand livre) : les écrans du nouveau module d'abord, puis
// les anciens écrans (Stock du Jour / Mouvement Stock) conservés le temps de la migration.
// Libellés traduits au rendu via t('stocknav.*').
const NAV = [
  ['/stock/tableau-bord', 'stocknav.dashboard', 'stock.tableau_bord'],
  ['/stock/releve-jour', 'stocknav.releve', 'stock.releve_jour'],
  ['/stock/saisie-mouvement', 'stocknav.saisiePF', 'stock.saisie'],
  ['/stock/saisie-mp', 'stocknav.saisieMP', 'stock.saisie'],
  ['/stock/journal', 'stocknav.movements', 'stock.consultation'],
  ['/stock/etat', 'stocknav.current', 'stock.consultation'],
  ['/stock/lots', 'stocknav.lots', 'stock.consultation'],
  ['/stock/transferts', 'stocknav.transfers', 'stock.transferts'],
  ['/stock/inventaires', 'stocknav.inventories', 'stock.inventaires'],
  ['/stock/valorisation', 'stocknav.valuation', 'stock.valorisation'],
  ['/stock/import', 'stocknav.import', 'stock.import'],
  ['/stock/referentiels', 'stocknav.settings', 'stock.referentiels'],
];

export default function StockSectionNav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const allowed = NAV.filter(([, , sub]) => hasSubModuleLevel(user, sub));
  return (
    <nav className="subnav">
      {allowed.map(([to, labelKey]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? 'active' : undefined)}>{t(labelKey)}</NavLink>
      ))}
    </nav>
  );
}
