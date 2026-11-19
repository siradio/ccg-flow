import { useI18n } from '../../i18n/I18nContext';

// Affiche un outil autonome (page HTML statique de public/outils/) dans une iframe plein cadre.
// Les outils sont de simples générateurs côté client (carte de visite, signature e-mail) : pas
// d'API ni d'authentification propre — l'accès à CCG Flow suffit (route protégée par l'auth).
export default function OutilFrame({ src, titleKey }) {
  const { t } = useI18n();
  const title = t(titleKey);
  // BASE_URL ('/' par défaut) : robuste si l'app est un jour servie sous un sous-chemin.
  const url = `${import.meta.env.BASE_URL}${src}`;
  return (
    <div>
      <h1 className="page-title">{title}</h1>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <iframe
          src={url}
          title={title}
          style={{ width: '100%', height: 'calc(100vh - 170px)', minHeight: 520, border: 'none', display: 'block' }}
        />
      </div>
    </div>
  );
}
