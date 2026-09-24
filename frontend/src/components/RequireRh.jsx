import { Navigate } from 'react-router-dom';
import { useAuth, isSuperAdmin } from '../auth/AuthContext';

// Rôles de validation / gestion RH. Donnent accès aux onglets À valider / Toutes / Tableau de bord
// / Paramètres (gardés individuellement dans les pages concernées).
const RH_ROLES = ['responsable', 'rh', 'daf', 'dg'];
export function hasRhAccess(user) {
  return isSuperAdmin(user) || (user?.roles || []).some(r => RH_ROLES.includes(r.role_code));
}

// Self-service RH : créer et suivre SES propres demandes (congé, absence…). Ouvert à tout compte
// relié à une fiche employé (tout salarié peut demander), plus les rôles RH et super_admin.
// C'est le niveau requis pour accéder au module ; les onglets de validation restent réservés.
export function hasRhSelfService(user) {
  return hasRhAccess(user) || !!(user && user.employee_id);
}

export default function RequireRh({ children }) {
  const { user } = useAuth();
  if (!hasRhSelfService(user)) return <Navigate to="/" replace />;
  return children;
}
