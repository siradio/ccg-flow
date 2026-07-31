import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, isSuperAdmin, hasModuleAccess, hasSubModuleLevel } from '../auth/AuthContext';
import NotificationBell from './NotificationBell';
import ThemeSwitcher from './ThemeSwitcher';
import logo from '../assets/logo-web-darklogo.png';

function navClass({ isActive }) {
  return isActive ? 'active' : undefined;
}

function initials(user) {
  return `${user?.prenom?.[0] || ''}${user?.nom?.[0] || ''}`.toUpperCase();
}

// Le lien "Stock" doit pointer vers un sous-module réellement accordé — un utilisateur qui n'a
// que Mouvement Stock (sans Stock du Jour, désormais possible depuis la refonte des permissions,
// §2.3 SPEC.md) ne doit pas atterrir sur un écran qui lui refuse l'accès.
function stockLinkTarget(user) {
  if (isSuperAdmin(user) || hasSubModuleLevel(user, 'stock.saisie_jour')) return '/stock/saisie';
  return '/stock/mouvements';
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand">
            <span className="brand-mark brand-mark-logo"><img src={logo} alt="CCG" /></span>
            CCG Flow
          </span>
          <nav className="main-nav">
            <NavLink to="/" end className={navClass}>Tableau de bord</NavLink>
            {hasModuleAccess(user, 'achats') && <NavLink to="/purchase-requests" className={navClass}>Demandes d'achat</NavLink>}
            {hasModuleAccess(user, 'kpi') && <NavLink to="/kpi" className={navClass}>KPI</NavLink>}
            {hasModuleAccess(user, 'stock') && <NavLink to={stockLinkTarget(user)} className={navClass}>Stock</NavLink>}
            {hasModuleAccess(user, 'prix') && <NavLink to="/prices/historique" className={navClass}>Prix</NavLink>}
            {(hasModuleAccess(user, 'referentiels') || hasModuleAccess(user, 'rh')) && <NavLink to="/referentials/sites" className={navClass}>Référentiels</NavLink>}
            {isSuperAdmin(user) && <NavLink to="/admin/users" className={navClass}>Utilisateurs</NavLink>}
            {isSuperAdmin(user) && <NavLink to="/admin/workflow" className={navClass}>Workflow</NavLink>}
          </nav>
        </div>
        <div className="topbar-right">
          <ThemeSwitcher />
          <NotificationBell />
          <span className="user-chip">
            <span className="user-avatar">{initials(user)}</span>
            {user?.prenom} {user?.nom}
          </span>
          <button onClick={() => { logout(); navigate('/login'); }} className="btn btn-invert btn-sm">
            Déconnexion
          </button>
        </div>
      </header>
      <main className="page-container">
        <Outlet />
      </main>
    </div>
  );
}
