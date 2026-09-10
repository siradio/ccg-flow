import ComptaSubnav from './ComptaSubnav.jsx';
import { useI18n } from '../../i18n/I18nContext';

// Comptabilité > Traitement > Bons de commande (commercial). Aucune source de BDC commerciaux dans
// CCG Flow pour l'instant (flux encore hors application) — état vide propre, aucune donnée fictive.
// Le futur module Commercial branchera ici via le même moteur de traitement générique.
export default function BdcCommercial() {
  const { t } = useI18n();
  return (
    <div>
      <ComptaSubnav />
      <h1 className="page-title" style={{ marginBottom: 6 }}>{t('acc.bdc.title')}</h1>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>{t('acc.bdc.subtitle')}</p>
      <div className="card">
        <p className="empty-row" style={{ margin: 0 }}>{t('acc.bdc.empty')}</p>
      </div>
    </div>
  );
}
