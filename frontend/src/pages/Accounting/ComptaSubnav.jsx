import { NavLink } from 'react-router-dom';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

// Sous-navigation du module Comptabilité — Traitement > Achats / Bons de commande. Chaque onglet est
// gaté sur son propre sous-module (l'écran l'est aussi côté route et côté API).
export default function ComptaSubnav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const cls = ({ isActive }) => (isActive ? 'active' : undefined);
  return (
    <nav className="subnav">
      {hasSubModuleLevel(user, 'comptabilite.achats') && (
        <NavLink to="/comptabilite/traitement/achats" className={cls}>{t('acc.nav.achats')}</NavLink>
      )}
      {hasSubModuleLevel(user, 'comptabilite.bdc') && (
        <NavLink to="/comptabilite/traitement/bons-de-commande" className={cls}>{t('acc.nav.bdc')}</NavLink>
      )}
    </nav>
  );
}

// Badge d'état de traitement comptable, réutilisé par la file et le détail.
export function ProcessingBadge({ status, name }) {
  const { t } = useI18n();
  const map = {
    NOT_PROCESSED: { bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)', key: 'acc.status.not' },
    IN_PROGRESS: { bg: 'var(--status-amber-bg, #fef3c7)', fg: 'var(--status-amber-fg, #b45309)', key: 'acc.status.inprogress' },
    PROCESSED: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)', key: 'acc.status.done' },
  };
  const c = map[status] || map.NOT_PROCESSED;
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>
      {t(c.key)}{name ? ` — ${name}` : ''}
    </span>
  );
}
