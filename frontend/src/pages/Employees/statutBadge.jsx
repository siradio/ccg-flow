import { useI18n } from '../../i18n/I18nContext';

const STATUT_COLORS = {
  actif: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  inactif: { bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
  sorti: { bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
};

export function StatutBadge({ statut }) {
  const { t } = useI18n();
  const c = STATUT_COLORS[statut] || STATUT_COLORS.inactif;
  const knownStatuts = ['actif', 'inactif', 'sorti'];
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {knownStatuts.includes(statut) ? t('emp.statut.' + statut) : statut}
    </span>
  );
}
