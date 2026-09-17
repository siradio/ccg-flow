import { useEffect, useState } from 'react';
import client from '../../api/client';
import Loading from '../../components/Loading';
import DsiSubnav from './DsiSubnav';
import { EquipStatutBadge } from './dsiLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

// Espace salarié — le matériel actuellement affecté à l'utilisateur connecté (lecture seule).
export default function MonMateriel() {
  const { t } = useI18n();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    client.get('/dsi/equipment/mine').then(r => setItems(r.data)).catch(e => setError(e.response?.data?.error || 'Erreur de chargement.'));
  }, []);

  return (
    <div>
      <DsiSubnav />
      <h1 className="page-title" style={{ marginBottom: 6 }}>{t('dsi.my.title')}</h1>
      <p className="page-subtitle" style={{ marginBottom: 14 }}>{t('dsi.my.subtitle')}</p>
      {error && <div className="alert alert-danger" style={{ maxWidth: 640 }}>{error}</div>}
      {items === null ? <Loading /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>{t('dsi.eq.numero')}</th><th>{t('dsi.eq.designation')}</th><th>{t('dsi.eq.type')}</th>
                <th>{t('dsi.eq.marque')}</th><th>{t('dsi.eq.serie')}</th><th>{t('dsi.eq.statut')}</th>
              </tr></thead>
              <tbody>
                {items.map(e => (
                  <tr key={e.id}>
                    <td><strong>{e.numero_inventaire}</strong></td>
                    <td>{e.designation}</td>
                    <td>{e.type_libelle || '—'}</td>
                    <td>{e.marque || '—'}{e.modele ? ` ${e.modele}` : ''}</td>
                    <td>{e.num_serie || '—'}</td>
                    <td><EquipStatutBadge statut={e.statut} /></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td className="empty-row" colSpan={6}>{t('dsi.my.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
