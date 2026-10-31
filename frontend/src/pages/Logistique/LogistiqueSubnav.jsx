import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import GroupedSubnav from '../../components/GroupedSubnav';

// Sous-navigation à 2 niveaux du module Logistique : menus (Parc / Exploitation / Entretien & coûts)
// → sous-menus. Chaque sous-menu est gaté par son sous-module.
export default function LogistiqueSubnav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const can = (sub) => hasSubModuleLevel(user, sub);
  const it = (to, labelKey, sub) => ({ to, label: t(labelKey), visible: can(sub) });
  const groups = [
    { key: 'parc', label: t('log.grp.parc'), items: [
      it('/logistique/vehicules', 'log.nav.vehicules', 'logistique.parc'),
      it('/logistique/types', 'log.nav.types', 'logistique.parc'),
      it('/logistique/conducteurs', 'log.nav.conducteurs', 'logistique.parc'),
      it('/logistique/documents', 'log.nav.documents', 'logistique.parc'),
    ] },
    { key: 'exploitation', label: t('log.grp.exploitation'), items: [
      it('/logistique/missions', 'log.nav.missions', 'logistique.missions'),
      it('/logistique/cartographie', 'log.nav.cartographie', 'logistique.suivi'),
      it('/logistique/checklists', 'log.nav.checklists', 'logistique.checklists'),
    ] },
    { key: 'entretien', label: t('log.grp.entretien'), items: [
      it('/logistique/carburant', 'log.nav.carburant', 'logistique.carburant'),
      it('/logistique/pannes', 'log.nav.pannes', 'logistique.maintenance'),
      it('/logistique/garages', 'log.nav.garages', 'logistique.maintenance'),
      it('/logistique/accidents', 'log.nav.accidents', 'logistique.accidents'),
    ] },
  ];
  return <GroupedSubnav groups={groups} />;
}
