export const STATUT_LABELS = { actif: 'Actif', inactif: 'Inactif', sorti: 'Sorti' };

const STATUT_COLORS = {
  actif: { bg: '#dcfce7', fg: '#166534' },
  inactif: { bg: '#f3f4f6', fg: '#374151' },
  sorti: { bg: '#fee2e2', fg: '#991b1b' },
};

export function StatutBadge({ statut }) {
  const c = STATUT_COLORS[statut] || STATUT_COLORS.inactif;
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {STATUT_LABELS[statut] || statut}
    </span>
  );
}
