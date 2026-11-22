// Badge d'affichage de la conformité d'une analyse / d'un résultat QHSE.
const MAP = {
  conforme: ['var(--status-green-fg, #15803d)', 'var(--status-green-bg, #e4f4ea)'],
  non_conforme: ['var(--status-red-fg, #b4232e)', 'var(--status-red-bg, #fbe6e7)'],
  en_attente: ['var(--status-amber-fg, #b5760a)', 'var(--status-amber-bg, #fbeecf)'],
  sans_spec: ['var(--color-text-muted)', 'var(--color-hover)'],
};

export function ConfBadge({ value, t }) {
  if (!value) return <span style={{ color: 'var(--color-text-faint)' }}>—</span>;
  const [fg, bg] = MAP[value] || MAP.sans_spec;
  return <span style={{ background: bg, color: fg, padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{t('qhse.conf.' + value)}</span>;
}
