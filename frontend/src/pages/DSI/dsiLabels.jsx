// Libellés & badges partagés du module DSI (statuts d'équipement, états, types de bénéficiaire).
export const EQUIP_STATUTS = [
  { v: 'disponible', l: 'Disponible', c: 'green' },
  { v: 'affecte', l: 'Affecté', c: 'blue' },
  { v: 'en_stock', l: 'En stock', c: 'neutral' },
  { v: 'en_maintenance', l: 'En maintenance', c: 'amber' },
  { v: 'en_panne', l: 'En panne', c: 'red' },
  { v: 'reforme', l: 'Réformé', c: 'neutral' },
  { v: 'perdu', l: 'Perdu', c: 'red' },
  { v: 'vole', l: 'Volé', c: 'red' },
];
export const ETATS = ['Neuf', 'Bon', 'Moyen', 'Mauvais'];
export const BENEFICIAIRE_TYPES = [
  { v: 'employe', l: 'Salarié' },
  { v: 'service', l: 'Service (BU)' },
  { v: 'filiale', l: 'Filiale' },
  { v: 'site', l: 'Site' },
];

const COLORS = {
  green: { bg: 'var(--status-green-bg, #dcfce7)', fg: 'var(--status-green-fg, #15803d)' },
  blue: { bg: '#dbeafe', fg: '#1d4ed8' },
  amber: { bg: 'var(--status-amber-bg, #fef3c7)', fg: 'var(--status-amber-fg, #b45309)' },
  red: { bg: '#fee2e2', fg: '#b91c1c' },
  neutral: { bg: 'var(--color-hover)', fg: 'var(--color-text-muted)' },
};

export function EquipStatutBadge({ statut }) {
  const s = EQUIP_STATUTS.find(x => x.v === statut) || { l: statut || '—', c: 'neutral' };
  const col = COLORS[s.c] || COLORS.neutral;
  return (
    <span style={{ background: col.bg, color: col.fg, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.l}</span>
  );
}

export const statutLabel = (v) => (EQUIP_STATUTS.find(x => x.v === v)?.l || v || '—');
export const beneficiaireLabel = (v) => (BENEFICIAIRE_TYPES.find(x => x.v === v)?.l || v || '—');

// ── Tickets ─────────────────────────────────────────────────────────────────
export const TICKET_STATUTS = [
  { v: 'ouvert', l: 'Ouvert', c: 'blue' },
  { v: 'affecte', l: 'Affecté', c: 'blue' },
  { v: 'en_cours', l: 'En cours', c: 'amber' },
  { v: 'en_attente', l: 'En attente', c: 'neutral' },
  { v: 'resolu', l: 'Résolu', c: 'green' },
  { v: 'cloture', l: 'Clôturé', c: 'neutral' },
  { v: 'annule', l: 'Annulé', c: 'neutral' },
];
export const ticketStatutLabel = (v) => (TICKET_STATUTS.find(x => x.v === v)?.l || v || '—');

export function TicketStatutBadge({ statut }) {
  const s = TICKET_STATUTS.find(x => x.v === statut) || { l: statut || '—', c: 'neutral' };
  const col = COLORS[s.c] || COLORS.neutral;
  return <span style={{ background: col.bg, color: col.fg, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.l}</span>;
}

export function PriorityBadge({ libelle, couleur }) {
  if (!libelle) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  return <span style={{ background: (couleur || '#6b7280') + '22', color: couleur || '#6b7280', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{libelle}</span>;
}

const SLA_STATE = {
  respecte: { l: 'Respecté', bg: COLORS.green.bg, fg: COLORS.green.fg },
  a_risque: { l: 'À risque', bg: COLORS.amber.bg, fg: COLORS.amber.fg },
  depasse: { l: 'Dépassé', bg: COLORS.red.bg, fg: COLORS.red.fg },
};
// Affiche l'état SLA de résolution (le plus parlant en liste).
export function SlaBadge({ sla }) {
  const r = sla?.resolution;
  if (!r) return <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>;
  const s = SLA_STATE[r.state] || SLA_STATE.respecte;
  const suffix = r.done ? '' : (r.remainingMin >= 0 ? ` · ${fmtMin(r.remainingMin)}` : ` · ${fmtMin(-r.remainingMin)} de retard`);
  return <span style={{ background: s.bg, color: s.fg, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.l}{suffix}</span>;
}
export function fmtMin(min) {
  const m = Math.abs(Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
}
