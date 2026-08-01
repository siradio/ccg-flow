export const STATUT_LABELS = { actif: 'Actif', inactif: 'Inactif', sorti: 'Sorti' };

const STATUT_COLORS = {
  actif: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  inactif: { bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
  sorti: { bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
};

export function StatutBadge({ statut }) {
  const c = STATUT_COLORS[statut] || STATUT_COLORS.inactif;
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {STATUT_LABELS[statut] || statut}
    </span>
  );
}
