import { Navigate } from 'react-router-dom';
import ReferentialPage from '../../Referentials/ReferentialPage';
import RhSubnav, { canManageRhTypes } from '../RhSubnav';
import { useAuth } from '../../../auth/AuthContext';
import { useI18n } from '../../../i18n/I18nContext';

// Catégories / domaines de compétence des tests de recrutement (maintenance, réseaux, cybersécurité…).
// Réutilise la page CRUD générique des référentiels sur /rh/recrutement/categories (réservé RH côté API).
export default function RecrutementCategories() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (!canManageRhTypes(user)) return <Navigate to="/rh/mes-demandes" replace />;
  const fields = [
    { key: 'nom', label: t('recr.cat.nom'), required: true },
    { key: 'code', label: t('recr.cat.code') },
    { key: 'description', label: t('recr.cat.description'), type: 'textarea' },
    { key: 'ordre', label: t('recr.cat.ordre'), type: 'number' },
    { key: 'actif', label: t('recr.cat.actif'), type: 'checkbox', default: true },
  ];
  return (
    <div>
      <RhSubnav />
      <ReferentialPage
        key="recr-categories" title={t('recr.cat.title')} endpoint="/rh/recrutement/categories"
        fields={fields} filters={['actif']} lists={{}} canAdd canEdit
      />
    </div>
  );
}
