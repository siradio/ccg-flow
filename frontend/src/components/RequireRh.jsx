import { Navigate } from 'react-router-dom';
import { useAuth, isSuperAdmin } from '../auth/AuthContext';

// Bloque l'accès au module RH (demandes) aux comptes sans rôle RH. L'accès s'attribue dans
// Admin → Utilisateurs → Rôles (responsable / rh / daf / dg). Les liens sont déjà masqués ; ceci
// empêche l'accès par URL directe.
const RH_ROLES = ['responsable', 'rh', 'daf', 'dg'];
export function hasRhAccess(user) {
  return isSuperAdmin(user) || (user?.roles || []).some(r => RH_ROLES.includes(r.role_code));
}

export default function RequireRh({ children }) {
  const { user } = useAuth();
  if (!hasRhAccess(user)) return <Navigate to="/" replace />;
  return children;
}
