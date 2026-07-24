import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, isSuperAdmin } from '../auth/AuthContext';
import logo from '../assets/logo-web-darklogo.png';

function navClass({ isActive }) {
  return isActive ? 'active' : undefined;
}

function initials(user) {
  return `${user?.prenom?.[0] || ''}${user?.nom?.[0] || ''}`.toUpperCase();
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
            <NavLink to="/purchase-requests" className={navClass}>Demandes d'achat</NavLink>
            <NavLink to="/referentials/sites" className={navClass}>Référentiels</NavLink>
            {isSuperAdmin(user) && <NavLink to="/admin/users" className={navClass}>Utilisateurs</NavLink>}
            {isSuperAdmin(user) && <NavLink to="/admin/workflow" className={navClass}>Workflow</NavLink>}
          </nav>
        </div>
        <div className="topbar-right">
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
