import { Navigate } from 'react-router-dom';
import { useAuth, isSuperAdmin, isUserAdmin } from '../auth/AuthContext';

// Bloque l'accès à une route d'administration selon le niveau requis — la navigation masque déjà
// ces liens, mais rien n'empêche de taper l'URL directement (même principe que RequireModule).
// level="user" : super_admin OU support_it (gestion des utilisateurs uniquement).
// level="super" (défaut) : super_admin uniquement (workflow, données de test...).
export default function RequireAdmin({ level = 'super', children }) {
  const { user } = useAuth();
  const allowed = level === 'user' ? isUserAdmin(user) : isSuperAdmin(user);
  if (!allowed) return <Navigate to="/" replace />;
  return children;
}
