import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <div style={{ padding: 24 }}>{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
