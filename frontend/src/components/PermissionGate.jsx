import { useAuth, hasRoleOnEntity, isSuperAdmin } from '../auth/AuthContext';

// Masque une action selon le rôle : le vrai contrôle reste côté serveur, ceci n'est qu'un confort d'UI.
export default function PermissionGate({ role, entityId, superAdminOnly, children }) {
  const { user } = useAuth();
  if (!user) return null;
  if (superAdminOnly) return isSuperAdmin(user) ? children : null;
  if (role && hasRoleOnEntity(user, role, entityId)) return children;
  return null;
}
