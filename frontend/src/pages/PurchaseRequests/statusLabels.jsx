export const STATUS_LABELS = {
  brouillon: 'Brouillon',
  en_attente_validation_besoin: 'En attente de validation (expression de besoin)',
  soumise: 'Soumise',
  en_analyse_achat: 'En analyse achat',
  devis_en_cours: 'Devis en cours',
  devis_selectionne: 'Devis sélectionné',
  en_validation: 'En validation',
  validee: 'Validée',
  rejetee: 'Refusée',
  bon_commande_genere: 'Bon de commande généré',
};

export const STATUS_ORDER = [
  'brouillon', 'en_attente_validation_besoin', 'soumise', 'en_analyse_achat', 'devis_en_cours', 'devis_selectionne',
  'en_validation', 'validee', 'bon_commande_genere', 'rejetee',
];

// Renvoie vers les tokens --status-* (index.css), theme-aware (clair/sombre) — plutôt que des
// hex figés qui resteraient identiques (et trop clairs) en mode sombre.
export const STATUS_COLORS = {
  brouillon: { bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
  en_attente_validation_besoin: { bg: 'var(--status-violet-bg)', fg: 'var(--status-violet-fg)' },
  soumise: { bg: 'var(--status-blue-bg)', fg: 'var(--status-blue-fg)' },
  en_analyse_achat: { bg: 'var(--status-blue-bg)', fg: 'var(--status-blue-fg)' },
  devis_en_cours: { bg: 'var(--status-amber-bg)', fg: 'var(--status-amber-fg)' },
  devis_selectionne: { bg: 'var(--status-amber-bg)', fg: 'var(--status-amber-fg)' },
  en_validation: { bg: 'var(--status-indigo-bg)', fg: 'var(--status-indigo-fg)' },
  validee: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  rejetee: { bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
  bon_commande_genere: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
};

export function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.brouillon;
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
