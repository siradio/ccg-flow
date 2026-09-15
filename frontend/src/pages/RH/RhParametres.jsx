import { Navigate } from 'react-router-dom';
import ReferentialPage from '../Referentials/ReferentialPage';
import RhSubnav, { canManageRhTypes } from './RhSubnav';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Paramètres RH — gestion des types de demande (congé / absence / recrutement) et de leur forfait
// de jours accordés. Ces types alimentent les listes déroulantes des formulaires Absence/Congé
// (via GET /rh/types) : plus rien n'est codé en dur. Réutilise la page CRUD générique des
// référentiels sur l'endpoint /rh/admin/types (réservé RH/super_admin côté backend).
export default function RhParametres() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (!canManageRhTypes(user)) return <Navigate to="/rh/mes-demandes" replace />;

  const fields = [
    { key: 'domaine', label: t('rh.param.domaine'), type: 'select', required: true, options: ['conge', 'absence', 'recrutement'],
      optionLabels: { conge: t('rh.param.dom.conge'), absence: t('rh.param.dom.absence'), recrutement: t('rh.param.dom.recrutement') } },
    { key: 'libelle', label: t('rh.param.libelle'), required: true },
    { key: 'code', label: t('rh.param.code'), required: true },
    { key: 'jours_accordes', label: t('rh.param.jours'), type: 'number' },
    { key: 'imputable_solde', label: t('rh.param.imputable'), type: 'checkbox' },
    { key: 'justificatif_requis', label: t('rh.param.justif'), type: 'checkbox' },
    { key: 'ordre', label: t('rh.param.ordre'), type: 'number' },
    { key: 'actif', label: t('rh.param.actif'), type: 'checkbox', default: true },
  ];

  return (
    <div>
      <RhSubnav />
      <ReferentialPage
        key="rh-types" title={t('rh.param.title')} endpoint="/rh/admin/types"
        fields={fields} filters={['domaine', 'actif']} lists={{}} canAdd canEdit
      />
    </div>
  );
}
