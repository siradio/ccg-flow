import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../../../api/client';
import RhSubnav, { canValidateRh } from '../RhSubnav';
import { useAuth } from '../../../auth/AuthContext';
import { useI18n } from '../../../i18n/I18nContext';

// Tableau de bord « Tests de recrutement » (Lot 0) : compteurs de pilotage. S'enrichira au fil des
// lots (candidats, invitations, tentatives, corrections en attente, taux de participation…).
export default function RecrutementDashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/rh/recrutement/dashboard').then(r => setData(r.data)).catch(e => setError(e.response?.data?.error || 'Erreur.'));
  }, []);

  if (!canValidateRh(user)) return <Navigate to="/rh/mes-demandes" replace />;

  const cards = data ? [
    { label: t('recr.kpi.activeCampaigns'), value: data.campagnes_actives },
    { label: t('recr.kpi.totalCampaigns'), value: data.campagnes_total },
    { label: t('recr.kpi.questions'), value: data.questions },
    { label: t('recr.kpi.publishedTemplates'), value: data.modeles_publies },
    { label: t('recr.kpi.categories'), value: data.categories },
  ] : [];

  return (
    <div>
      <RhSubnav />
      <h1 className="page-title" style={{ margin: '4px 0 6px' }}>{t('recr.dashboard.title')}</h1>
      <p className="page-subtitle" style={{ marginTop: 0 }}>{t('recr.dashboard.subtitle')}</p>
      {error && <div className="alert alert-danger">{error}</div>}
      {!data && !error && <p>{t('common.loading')}</p>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginTop: 14 }}>
          {cards.map(c => (
            <div key={c.label} className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
