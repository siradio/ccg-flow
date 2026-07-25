import { Navigate } from 'react-router-dom';
import { useAuth, hasModule } from '../auth/AuthContext';

// Bloque l'accès à une route dont le module n'a pas été accordé à l'utilisateur — la
// navigation masque déjà ces liens, mais rien n'empêche de taper l'URL directement.
export default function RequireModule({ module, children }) {
  const { user } = useAuth();
  if (!hasModule(user, module)) return <Navigate to="/" replace />;
  return children;
}
