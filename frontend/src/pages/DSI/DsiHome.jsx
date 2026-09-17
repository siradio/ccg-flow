import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { firstDsiTarget } from './DsiSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Point d'entrée /dsi : redirige vers la première section accessible (les sections s'ajoutent au fil
// des lots ; le tableau de bord deviendra la destination par défaut une fois livré).
export default function DsiHome() {
  const { user } = useAuth();
  const { t } = useI18n();
  const target = firstDsiTarget(user);
  if (target) return <Navigate to={target} replace />;
  return <p style={{ padding: 16 }}>{t('dsi.access.denied')}</p>;
}
