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
