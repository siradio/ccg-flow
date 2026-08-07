import { NavLink } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nContext';

export default function PricesSubnav() {
  const { t } = useI18n();
  return (
    <nav className="subnav">
      <NavLink to="/prices/historique" className={({ isActive }) => isActive ? 'active' : undefined}>{t('prix.tab.history')}</NavLink>
      <NavLink to="/prices/graphique" className={({ isActive }) => isActive ? 'active' : undefined}>{t('prix.tab.chart')}</NavLink>
    </nav>
  );
}
