import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Sous-navigation partagée du module Logistique — utilisée par les écrans génériques (LogistiqueIndex)
// et par la page Checklists (custom). Chaque onglet est gaté par son sous-module.
// [chemin, clé i18n du libellé, sous-module]
const NAV = [
  ['/logistique/vehicules', 'log.nav.vehicules', 'logistique.parc'],
  ['/logistique/conducteurs', 'log.nav.conducteurs', 'logistique.parc'],
  ['/logistique/missions', 'log.nav.missions', 'logistique.missions'],
  ['/logistique/checklists', 'log.nav.checklists', 'logistique.checklists'],
  ['/logistique/pannes', 'log.nav.pannes', 'logistique.maintenance'],
  ['/logistique/accidents', 'log.nav.accidents', 'logistique.accidents'],
  ['/logistique/cartographie', 'log.nav.cartographie', 'logistique.suivi'],
  ['/logistique/garages', 'log.nav.garages', 'logistique.maintenance'],
  ['/logistique/documents', 'log.nav.documents', 'logistique.parc'],
  ['/logistique/types', 'log.nav.types', 'logistique.parc'],
];

export default function LogistiqueSubnav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const allowed = NAV.filter(([, , sub]) => hasSubModuleLevel(user, sub));
  return (
    <nav className="subnav">
      {allowed.map(([to, labelKey]) => (
        <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : undefined}>{t(labelKey)}</NavLink>
      ))}
    </nav>
  );
}
