import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, isSuperAdmin, isUserAdmin, hasModuleAccess, hasSubModuleLevel } from '../auth/AuthContext';
import client from '../api/client';
import NotificationBell from './NotificationBell';
import ThemeSwitcher from './ThemeSwitcher';
import InstallPWA from './InstallPWA';
import LanguageSwitcher from './LanguageSwitcher';
import { useI18n } from '../i18n/I18nContext';
import {
  IconDashboard, IconCart, IconBox, IconBook,
  IconUsers, IconWorkflow, IconDatabase, IconSettings, IconChevron, IconLogout, IconMail,
  IconMenu, IconClose, IconImage, IconTruck, IconLink, IconChart,
} from './icons';
import logo from '../assets/logo-web-darklogo.png';

function navClass({ isActive }) {
  return isActive ? 'active' : undefined;
}

function initials(user) {
  return `${user?.prenom?.[0] || ''}${user?.nom?.[0] || ''}`.toUpperCase();
}

// Le lien "Stock" pointe vers le premier écran réellement accordé du module (refonte grand livre).
function stockLinkTarget(user) {
  if (isSuperAdmin(user) || hasSubModuleLevel(user, 'stock.tableau_bord')) return '/stock/tableau-bord';
  // Le relevé du jour est l'écran opérationnel quotidien : on l'ouvre en priorité (avant le
  // Paramétrage), pour ne pas atterrir sur la config quand c'est la saisie du matin qui est visée.
  if (hasSubModuleLevel(user, 'stock.releve_jour')) return '/stock/releve-jour';
  if (hasSubModuleLevel(user, 'stock.consultation')) return '/stock/etat';
  if (hasSubModuleLevel(user, 'stock.saisie')) return '/stock/saisie-mouvement';
  if (hasSubModuleLevel(user, 'stock.referentiels')) return '/stock/referentiels';
  return '/stock/tableau-bord';
}

// Le lien "Production" pointe vers la saisie si accordée, sinon vers le suivi (consultation).
function productionLinkTarget(user) {
  if (isSuperAdmin(user) || hasSubModuleLevel(user, 'production.releve')) return '/production/releve';
  return '/production/suivi';
}

// Rangés sous un onglet "Paramètres" repliable plutôt que mélangés aux liens de nav principaux —
// ce sont des écrans d'administration, pas des modules métier du quotidien, donc pas au même
// niveau de visibilité par défaut. "Utilisateurs" est aussi accessible à support_it (superOnly
// absent) ; Workflow/Données de test restent réservés aux vrais super_admin.
const PARAMS_ITEMS = [
  { to: '/admin/users', labelKey: 'nav.users', Icon: IconUsers },
  { to: '/admin/stats', labelKey: 'nav.stats', Icon: IconDashboard },
  { to: '/admin/workflow', labelKey: 'nav.workflow', Icon: IconWorkflow, superOnly: true },
  { to: '/admin/email', labelKey: 'nav.email', Icon: IconMail, superOnly: true },
  { to: '/admin/documents', labelKey: 'nav.branding', Icon: IconImage, superOnly: true },
  { to: '/admin/login-background', labelKey: 'nav.loginBg', Icon: IconImage, superOnly: true },
  { to: '/admin/test-data', labelKey: 'nav.testData', Icon: IconDatabase, superOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [paramsOpen, setParamsOpen] = useState(location.pathname.startsWith('/admin'));
  const [liensOpen, setLiensOpen] = useState(location.pathname.startsWith('/liens'));
  const [liensCategories, setLiensCategories] = useState([]);
  // Tiroir de navigation mobile : masqué par défaut, ouvert par le bouton hamburger de la topbar.
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);

  // Sous-menus du module « Liens utiles » = ses catégories (pilotées par la base, extensibles).
  const hasLiens = hasModuleAccess(user, 'liens');
  useEffect(() => {
    if (!hasLiens) return;
    client.get('/liens/categories').then(r => setLiensCategories(r.data)).catch(() => {});
  }, [hasLiens]);

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
          <button type="button" className="sidebar-close" onClick={closeNav} aria-label={t('common.closeMenu')}>
            <IconClose />
          </button>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={navClass} onClick={closeNav}><IconDashboard /> {t('nav.dashboard')}</NavLink>
          {hasModuleAccess(user, 'direction') && <NavLink to="/direction" className={navClass} onClick={closeNav}><IconChart /> {t('nav.cockpit')}</NavLink>}
          {hasModuleAccess(user, 'achats') && <NavLink to="/purchase-requests" className={navClass} onClick={closeNav}><IconCart /> {t('nav.purchases')}</NavLink>}
          {hasModuleAccess(user, 'stock') && <NavLink to={stockLinkTarget(user)} className={navClass} onClick={closeNav}><IconBox /> {t('nav.stock')}</NavLink>}
          {hasModuleAccess(user, 'logistique') && <NavLink to="/logistique/vehicules" className={navClass} onClick={closeNav}><IconTruck /> {t('nav.logistics')}</NavLink>}
          {hasModuleAccess(user, 'production') && <NavLink to={productionLinkTarget(user)} className={navClass} onClick={closeNav}><IconWorkflow /> {t('nav.production')}</NavLink>}
          {(hasModuleAccess(user, 'referentiels') || hasModuleAccess(user, 'rh')) && <NavLink to="/referentials/sites" className={navClass} onClick={closeNav}><IconBook /> {t('nav.referentials')}</NavLink>}
          {hasLiens && (
            <div className="sidebar-group">
              <button type="button" className="sidebar-group-toggle" onClick={() => setLiensOpen(o => !o)}>
                <IconLink /> {t('nav.usefulLinks')}
                <span className={`sidebar-chevron${liensOpen ? ' sidebar-chevron-open' : ''}`}><IconChevron /></span>
              </button>
              {liensOpen && (
                <div className="sidebar-subnav">
                  {liensCategories.map(c => (
                    <NavLink key={c.id} to={`/liens/${c.slug}`} className={navClass} onClick={closeNav}>{c.nom}</NavLink>
                  ))}
                </div>
              )}
            </div>
          )}

          {userAdmin && (
            <div className="sidebar-group">
              <button type="button" className="sidebar-group-toggle" onClick={() => setParamsOpen(o => !o)}>
                <IconSettings /> {t('nav.settings')}
                <span className={`sidebar-chevron${paramsOpen ? ' sidebar-chevron-open' : ''}`}><IconChevron /></span>
              </button>
              {paramsOpen && (
                <div className="sidebar-subnav">
                  {visibleParamsItems.map(({ to, labelKey, Icon }) => (
                    <NavLink key={to} to={to} className={navClass} onClick={closeNav}><Icon /> {t(labelKey)}</NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button type="button" className="nav-toggle" onClick={() => setNavOpen(true)} aria-label={t('common.openMenu')}>
            <IconMenu />
          </button>
          <div className="topbar-right">
            <InstallPWA />
            <LanguageSwitcher />
            <ThemeSwitcher />
            <NotificationBell />
            <span className="user-chip">
              <span className="user-avatar">{initials(user)}</span>
              <span className="user-name">{user?.prenom} {user?.nom}</span>
            </span>
            <button onClick={() => { logout(); navigate('/login'); }} className="btn btn-secondary btn-sm">
              <IconLogout /> <span className="btn-label">{t('common.logout')}</span>
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
