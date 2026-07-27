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

export const STATUS_COLORS = {
  brouillon: { bg: '#f3f4f6', fg: '#374151' },
  en_attente_validation_besoin: { bg: '#ede9fe', fg: '#5b21b6' },
  soumise: { bg: '#dbeafe', fg: '#1e40af' },
  en_analyse_achat: { bg: '#dbeafe', fg: '#1e40af' },
  devis_en_cours: { bg: '#fef3c7', fg: '#92400e' },
  devis_selectionne: { bg: '#fef3c7', fg: '#92400e' },
  en_validation: { bg: '#e0e7ff', fg: '#3730a3' },
  validee: { bg: '#dcfce7', fg: '#166534' },
  rejetee: { bg: '#fee2e2', fg: '#991b1b' },
  bon_commande_genere: { bg: '#dcfce7', fg: '#166534' },
};

export function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.brouillon;
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
