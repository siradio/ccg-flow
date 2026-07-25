import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, isSuperAdmin, hasModule } from '../auth/AuthContext';
import logo from '../assets/logo-web-darklogo.png';

function navClass({ isActive }) {
  return isActive ? 'active' : undefined;
}

function initials(user) {
  return `${user?.prenom?.[0] || ''}${user?.nom?.[0] || ''}`.toUpperCase();
}

const REF_MODULE_KEYS = [
  'ref_entities', 'ref_sites', 'ref_warehouses', 'ref_machines',
  'ref_products', 'ref_product_categories', 'ref_business_units', 'ref_suppliers',
];

function hasAnyRefModule(user) {
  if (isSuperAdmin(user)) return true;
  return REF_MODULE_KEYS.some(k => hasModule(user, k));
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
            {hasModule(user, 'achats') && <NavLink to="/purchase-requests" className={navClass}>Demandes d'achat</NavLink>}
            {hasModule(user, 'rh') && <NavLink to="/employees" className={navClass}>Employés</NavLink>}
            {hasAnyRefModule(user) && <NavLink to="/referentials/sites" className={navClass}>Référentiels</NavLink>}
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
