import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, isSuperAdmin, isUserAdmin, hasModuleAccess, hasSubModuleLevel } from '../auth/AuthContext';
import NotificationBell from './NotificationBell';
import ThemeSwitcher from './ThemeSwitcher';
import {
  IconDashboard, IconCart, IconBox, IconBook,
  IconUsers, IconWorkflow, IconDatabase, IconSettings, IconChevron, IconLogout, IconMail,
  IconMenu, IconClose,
} from './icons';
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

// Rangés sous un onglet "Paramètres" repliable plutôt que mélangés aux liens de nav principaux —
// ce sont des écrans d'administration, pas des modules métier du quotidien, donc pas au même
// niveau de visibilité par défaut. "Utilisateurs" est aussi accessible à support_it (superOnly
// absent) ; Workflow/Données de test restent réservés aux vrais super_admin.
const PARAMS_ITEMS = [
  { to: '/admin/users', label: 'Utilisateurs', Icon: IconUsers },
  { to: '/admin/workflow', label: 'Workflow', Icon: IconWorkflow, superOnly: true },
  { to: '/admin/email', label: 'Email (SMTP)', Icon: IconMail, superOnly: true },
  { to: '/admin/test-data', label: 'Données de test', Icon: IconDatabase, superOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [paramsOpen, setParamsOpen] = useState(location.pathname.startsWith('/admin'));
  // Tiroir de navigation mobile : masqué par défaut, ouvert par le bouton hamburger de la topbar.
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);

  const admin = isSuperAdmin(user);
  const userAdmin = isUserAdmin(user);
  const visibleParamsItems = PARAMS_ITEMS.filter(item => admin || !item.superOnly);

  return (
    <div className="app-shell">
      {navOpen && <div className="sidebar-backdrop" onClick={closeNav} />}
      <aside className={`sidebar${navOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark brand-mark-logo"><img src={logo} alt="CCG" /></span>
          CCG Flow
          <button type="button" className="sidebar-close" onClick={closeNav} aria-label="Fermer le menu">
            <IconClose />
          </button>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={navClass} onClick={closeNav}><IconDashboard /> Tableau de bord</NavLink>
          {hasModuleAccess(user, 'achats') && <NavLink to="/purchase-requests" className={navClass} onClick={closeNav}><IconCart /> Demandes d'achat</NavLink>}
          {hasModuleAccess(user, 'stock') && <NavLink to={stockLinkTarget(user)} className={navClass} onClick={closeNav}><IconBox /> Stock</NavLink>}
          {(hasModuleAccess(user, 'referentiels') || hasModuleAccess(user, 'rh')) && <NavLink to="/referentials/sites" className={navClass} onClick={closeNav}><IconBook /> Référentiels</NavLink>}

          {userAdmin && (
            <div className="sidebar-group">
              <button type="button" className="sidebar-group-toggle" onClick={() => setParamsOpen(o => !o)}>
                <IconSettings /> Paramètres
                <span className={`sidebar-chevron${paramsOpen ? ' sidebar-chevron-open' : ''}`}><IconChevron /></span>
              </button>
              {paramsOpen && (
                <div className="sidebar-subnav">
                  {visibleParamsItems.map(({ to, label, Icon }) => (
                    <NavLink key={to} to={to} className={navClass} onClick={closeNav}><Icon /> {label}</NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button type="button" className="nav-toggle" onClick={() => setNavOpen(true)} aria-label="Ouvrir le menu">
            <IconMenu />
          </button>
          <div className="topbar-right">
            <ThemeSwitcher />
            <NotificationBell />
            <span className="user-chip">
              <span className="user-avatar">{initials(user)}</span>
              <span className="user-name">{user?.prenom} {user?.nom}</span>
            </span>
            <button onClick={() => { logout(); navigate('/login'); }} className="btn btn-secondary btn-sm">
              <IconLogout /> <span className="btn-label">Déconnexion</span>
            </button>
          </div>
        </header>
        <main className="page-container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
