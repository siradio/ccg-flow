import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Sous-navigation partagée du module Logistique — utilisée par les écrans génériques (LogistiqueIndex)
// et par la page Checklists (custom). Chaque onglet est gaté par son sous-module.
// [chemin, clé i18n du libellé, sous-module]
// Regroupé par sous-module pour une lecture cohérente : d'abord le Parc véhicule (véhicules,
// conducteurs, types, documents), puis missions, checklists, la maintenance (pannes, garages),
// accidents et le suivi.
const NAV = [
  // Parc véhicule (logistique.parc) — ordre logique de saisie : type d'abord, puis véhicules.
  ['/logistique/types', 'log.nav.types', 'logistique.parc'],
  ['/logistique/vehicules', 'log.nav.vehicules', 'logistique.parc'],
  ['/logistique/conducteurs', 'log.nav.conducteurs', 'logistique.parc'],
  ['/logistique/documents', 'log.nav.documents', 'logistique.parc'],
  // Missions
  ['/logistique/missions', 'log.nav.missions', 'logistique.missions'],
  // Checklists
  ['/logistique/checklists', 'log.nav.checklists', 'logistique.checklists'],
  // Maintenance (logistique.maintenance)
  ['/logistique/pannes', 'log.nav.pannes', 'logistique.maintenance'],
  ['/logistique/garages', 'log.nav.garages', 'logistique.maintenance'],
  // Accidents & suivi
  ['/logistique/accidents', 'log.nav.accidents', 'logistique.accidents'],
  ['/logistique/cartographie', 'log.nav.cartographie', 'logistique.suivi'],
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
