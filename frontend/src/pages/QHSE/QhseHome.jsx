import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { firstQhseTarget } from './QhseSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Point d'entrée /qhse : redirige vers la première section accessible. Le tableau de bord deviendra
// la destination par défaut une fois livré (lot ultérieur).
export default function QhseHome() {
  const { user } = useAuth();
  const { t } = useI18n();
  const target = firstQhseTarget(user);
  if (target) return <Navigate to={target} replace />;
  return <p style={{ padding: 16 }}>{t('qhse.access.denied')}</p>;
}
