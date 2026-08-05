export const ROLE_CODES = ['super_admin', 'support_it', 'demandeur', 'service_achat', 'controle_gestion', 'finances', 'validateur_besoin'];
// Rôles globaux, non rattachés à une entité (comme super_admin) — voir users.routes.js.
export const GLOBAL_ROLES = ['super_admin', 'support_it'];
export const NIVEAUX = [
  { value: '', label: '— (aucun accès)' },
  { value: 'consultation', label: 'Consultation (lecture seule)' },
  { value: 'ajout', label: 'Ajout (peut créer)' },
  { value: 'edition', label: 'Édition (peut aussi modifier/supprimer)' },
];

// Statut consolidé d'un compte : la demande d'accès (pending/rejected) prime sur l'actif/inactif.
export function userStatus(u) {
  if (u.access_status === 'pending') return 'pending';
  if (u.access_status === 'rejected') return 'rejected';
  return u.actif ? 'active' : 'inactive';
}
export const STATUS_META = {
  active: { label: 'Actif', bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  inactive: { label: 'Désactivé', bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
  pending: { label: 'À valider', bg: 'var(--status-amber-bg)', fg: 'var(--status-amber-fg)' },
  rejected: { label: 'Rejeté', bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
};

export function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  return <span className="badge" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>;
}
