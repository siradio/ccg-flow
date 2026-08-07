import { useI18n } from '../../../i18n/I18nContext';

export const ROLE_CODES = ['super_admin', 'support_it', 'demandeur', 'service_achat', 'controle_gestion', 'finances', 'validateur_besoin'];
// Rôles globaux, non rattachés à une entité (comme super_admin) — voir users.routes.js.
export const GLOBAL_ROLES = ['super_admin', 'support_it'];
// Niveaux d'accès module — le libellé est traduit à l'affichage (labelKey), la valeur stockée ne change pas.
export const NIVEAUX = [
  { value: '', labelKey: 'adm.niveau.none' },
  { value: 'consultation', labelKey: 'adm.niveau.consultation' },
  { value: 'ajout', labelKey: 'adm.niveau.ajout' },
  { value: 'edition', labelKey: 'adm.niveau.edition' },
];

// Statut consolidé d'un compte : la demande d'accès (pending/rejected) prime sur l'actif/inactif.
export function userStatus(u) {
  if (u.access_status === 'pending') return 'pending';
  if (u.access_status === 'rejected') return 'rejected';
  return u.actif ? 'active' : 'inactive';
}
// Le libellé est traduit à l'affichage via labelKey (voir StatusBadge / filtres).
export const STATUS_META = {
  active: { labelKey: 'adm.status.active', bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)' },
  inactive: { labelKey: 'adm.status.inactive', bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
  pending: { labelKey: 'adm.status.pending', bg: 'var(--status-amber-bg)', fg: 'var(--status-amber-fg)' },
  rejected: { labelKey: 'adm.status.rejected', bg: 'var(--status-red-bg)', fg: 'var(--status-red-fg)' },
};

export function StatusBadge({ status }) {
  const { t } = useI18n();
  const meta = STATUS_META[status];
  return <span className="badge" style={{ background: meta.bg, color: meta.fg }}>{t(meta.labelKey)}</span>;
}
