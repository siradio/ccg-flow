import { Navigate } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../auth/AuthContext';

// Bloque l'accès à une route dont le sous-module n'a pas été accordé à l'utilisateur — la
// navigation masque déjà ces liens, mais rien n'empêche de taper l'URL directement.
export default function RequireModule({ subModule, minNiveau = 'consultation', children }) {
  const { user } = useAuth();
  if (!hasSubModuleLevel(user, subModule, minNiveau)) return <Navigate to="/" replace />;
  return children;
}
