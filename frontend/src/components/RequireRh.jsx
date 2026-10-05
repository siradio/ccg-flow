import { Navigate } from 'react-router-dom';
import { useAuth, isSuperAdmin } from '../auth/AuthContext';

// Rôles de validation / gestion RH. Donnent accès aux onglets À valider / Toutes / Tableau de bord
// / Paramètres (gardés individuellement dans les pages concernées).
const RH_ROLES = ['responsable', 'rh', 'daf', 'dg'];
export function hasRhAccess(user) {
  return isSuperAdmin(user) || (user?.roles || []).some(r => RH_ROLES.includes(r.role_code));
}

// Self-service RH : créer et suivre SES propres demandes (congé, absence…). Ouvert à TOUT compte
// connecté (chaque salarié peut faire ses demandes). La création nécessite que le compte soit relié
// à une fiche employé (sinon message explicite) ; les onglets de validation restent réservés aux rôles RH.
export function hasRhSelfService(user) {
  return !!user;
}

export default function RequireRh({ children }) {
  const { user } = useAuth();
  if (!hasRhSelfService(user)) return <Navigate to="/" replace />;
  return children;
}
