import { useI18n } from '../../i18n/I18nContext';

// Affiche, à titre informatif, les jours fériés tombant dans la période choisie et non décomptés.
// Rendu uniquement s'il y en a au moins un.
export default function FeriesInfo({ feries }) {
  const { t } = useI18n();
  if (!feries || feries.length === 0) return null;
  const fmt = (d) => {
    const [y, m, j] = String(d).split('-');
    return `${j}/${m}/${y}`;
  };
  return (
    <div className="alert" style={{ background: 'var(--color-hover)', color: 'var(--color-text-muted)', margin: 0 }}>
      <strong>{t('rh.absence.feriesTitle')}</strong>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {feries.map(f => (
          <li key={f.date}>{fmt(f.date)}{f.libelle ? ` — ${f.libelle}` : ''}</li>
        ))}
      </ul>
    </div>
  );
}
