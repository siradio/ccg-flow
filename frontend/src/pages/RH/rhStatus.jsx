import { useI18n } from '../../i18n/I18nContext';

export const RH_STATUS_COLORS = {
  brouillon: { bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
  en_validation: { bg: 'var(--status-indigo-bg)', fg: 'var(--status-indigo-fg)' },
  validee: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  refusee: { bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
  annulee: { bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
  cloturee: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
};

export function RhStatusBadge({ statut }) {
  const { t } = useI18n();
  const c = RH_STATUS_COLORS[statut] || RH_STATUS_COLORS.brouillon;
  return <span className="badge" style={{ background: c.bg, color: c.fg }}>{t('rh.status.' + statut)}</span>;
}

export const RH_TYPE_LABELS = { absence: 'rh.type.absence', conge: 'rh.type.conge', recrutement: 'rh.type.recrutement', cdi: 'rh.type.cdi' };
