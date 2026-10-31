import { NavLink, useLocation, useNavigate } from 'react-router-dom';

// Sous-navigation à DEUX niveaux : une ligne de « menus » (groupes), puis la ligne des « sous-menus »
// du menu actif. Le menu actif est déduit de l'URL courante. Les sous-menus non autorisés sont
// masqués (visible:false) et un groupe sans aucun sous-menu visible disparaît.
// `groups` = [{ key, label, items: [{ to, label, visible }] }]
export default function GroupedSubnav({ groups }) {
  const location = useLocation();
  const navigate = useNavigate();
  const vis = groups
    .map(g => ({ ...g, items: g.items.filter(i => i.visible !== false) }))
    .filter(g => g.items.length);
  if (!vis.length) return null;

  const path = location.pathname;
  const matches = (to) => path === to || path.startsWith(to + '/');
  const active = vis.find(g => g.items.some(i => matches(i.to))) || vis[0];

  return (
    <>
      <nav className="subnav">
        {vis.map(g => (
          <button key={g.key} type="button" className="subnav-group" data-active={g === active ? 'true' : undefined}
            onClick={() => navigate(g.items[0].to)}>{g.label}</button>
        ))}
      </nav>
      <nav className="subnav subnav-nested">
        {active.items.map(i => (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => isActive ? 'active' : undefined}>{i.label}</NavLink>
        ))}
      </nav>
    </>
  );
}
