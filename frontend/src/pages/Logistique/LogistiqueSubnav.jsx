import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';

// Sous-navigation partagée du module Logistique — utilisée par les écrans génériques (LogistiqueIndex)
// et par la page Checklists (custom). Chaque onglet est gaté par son sous-module.
const NAV = [
  ['/logistique/vehicules', 'Véhicules', 'logistique.parc'],
  ['/logistique/conducteurs', 'Conducteurs', 'logistique.parc'],
  ['/logistique/missions', 'Missions', 'logistique.missions'],
  ['/logistique/checklists', 'Checklists', 'logistique.checklists'],
  ['/logistique/pannes', 'Pannes', 'logistique.maintenance'],
  ['/logistique/accidents', 'Accidents', 'logistique.accidents'],
  ['/logistique/garages', 'Garages', 'logistique.maintenance'],
  ['/logistique/documents', 'Documents & échéances', 'logistique.parc'],
  ['/logistique/types', 'Types de véhicule', 'logistique.parc'],
];

export default function LogistiqueSubnav() {
  const { user } = useAuth();
  const allowed = NAV.filter(([, , sub]) => hasSubModuleLevel(user, sub));
  return (
    <nav className="subnav">
      {allowed.map(([to, label]) => (
        <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : undefined}>{label}</NavLink>
      ))}
    </nav>
  );
}
