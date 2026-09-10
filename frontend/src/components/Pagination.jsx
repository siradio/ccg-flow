import { useI18n } from '../i18n/I18nContext';

// Pagination client réutilisable. `total` = nombre total d'éléments (après filtres), `pageSize` la
// taille de page. N'affiche rien s'il n'y a qu'une page. Précédent / indicateur / Suivant + décompte.
export default function Pagination({ page, total, pageSize = 20, onPage }) {
  const { t } = useI18n();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('pg.range', { from, to, total })}</span>
      <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('pg.prev')}</button>
      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{t('pg.page', { page, pageCount })}</span>
      <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>{t('pg.next')}</button>
    </div>
  );
}
