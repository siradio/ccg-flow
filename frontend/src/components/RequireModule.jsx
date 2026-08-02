import { Navigate } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../auth/AuthContext';

// Bloque l'accès à une route dont le sous-module n'a pas été accordé à l'utilisateur — la
// navigation masque déjà ces liens, mais rien n'empêche de taper l'URL directement.
//
// `subModule` accepte aussi un tableau (ex. les 3 sous-modules KPI) pour une route unique dont le
// contenu se répartit lui-même en plusieurs onglets gatés individuellement (voir KpiPage.jsx) —
// l'accès à la route suffit dès qu'AU MOINS UN des sous-modules listés est accordé.
export default function RequireModule({ subModule, minNiveau = 'consultation', children }) {
  const { user } = useAuth();
  const subModules = Array.isArray(subModule) ? subModule : [subModule];
  const allowed = subModules.some(sm => hasSubModuleLevel(user, sm, minNiveau));
  if (!allowed) return <Navigate to="/" replace />;
  return children;
}
