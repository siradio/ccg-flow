import { useState } from 'react';
import client from '../../api/client';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useI18n } from '../../i18n/I18nContext';

// Réservé au super_admin (lien de nav masqué pour les autres, backend gate via requireSuperAdmin) —
// génère/efface des demandes d'achat de test via le VRAI circuit (purchase-requests.service.js),
// jamais des lignes SQL à la main, pour ne jamais dériver des règles métier réelles. Le vidage ne
// touche jamais aux référentiels (fournisseurs, produits, entités...) ni aux comptes utilisateurs.
export default function TestData() {
  const confirm = useConfirm();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function loadSampleData() {
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await client.post('/test-data/load');
      setResult({ type: 'load', ...res.data });
    } catch (err) {
      setError(err.response?.data?.error || t('adm.common.genericError'));
    } finally {
      setLoading(false);
    }
  }

  async function clearTestData() {
    const ok = await confirm(
      t('adm.test.confirmClear'),
      { danger: true, confirmLabel: t('adm.test.clearConfirmLabel') }
    );
    if (!ok) return;
    setError('');
    setResult(null);
    setClearing(true);
    try {
      await client.post('/test-data/clear');
      setResult({ type: 'clear' });
    } catch (err) {
      setError(err.response?.data?.error || t('adm.common.genericError'));
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 4 }}>{t('adm.test.title')}</h1>
      <p className="page-subtitle" style={{ marginBottom: 20, maxWidth: 600 }}>
        {t('adm.test.subtitle')}
      </p>

      <section className="card" style={{ maxWidth: 560 }}>
        <h2>{t('adm.test.loadTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('adm.test.loadDesc1')}
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('adm.test.loadDesc2pre')}<strong>Cockpit</strong>{t('adm.test.loadDesc2post')}
        </p>
        <button className="btn btn-primary" onClick={loadSampleData} disabled={loading}>
          {loading ? t('adm.test.generating') : t('adm.test.loadBtn')}
        </button>
      </section>

      <section className="card" style={{ maxWidth: 560 }}>
        <h2>{t('adm.test.clearTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('adm.test.clearDesc')}
        </p>
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          {t('adm.test.irreversibleWarn')}
        </div>
        <button className="btn btn-danger" onClick={clearTestData} disabled={clearing}>
          {clearing ? t('adm.test.clearing') : t('adm.test.clearBtn')}
        </button>
      </section>

      {error && <div className="alert alert-danger" style={{ maxWidth: 560 }}>{error}</div>}

      {result?.type === 'load' && (
        <div className="alert alert-success" style={{ maxWidth: 560 }}>
          {t('adm.test.result.created', { n: result.created })}
          {result.demo && (
            result.demo.produits > 0 ? (
              <>
                <br />{t('adm.test.result.cockpit', { produits: result.demo.produits, jours: result.demo.jours, releves: result.demo.releves, production: result.demo.production })}
                {result.demo.stockInitial > 0 && <>{t('adm.test.result.stockInitial', { n: result.demo.stockInitial })}</>}
                {result.demo.employes > 0 && <>{t('adm.test.result.employes', { n: result.demo.employes })}</>}.
                {result.demo.produitsCrees > 0 && (
                  <><br />{t('adm.test.result.produitsCrees', { n: result.demo.produitsCrees })}</>
                )}
              </>
            ) : (
              <><br />{t('adm.test.result.cockpitNote', { note: result.demo.note })}</>
            )
          )}
          {result.skipped?.length > 0 && (
            <>
              <br />{t('adm.test.result.skipped')}
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {result.skipped.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
      {result?.type === 'clear' && (
        <div className="alert alert-success" style={{ maxWidth: 560 }}>{t('adm.test.result.cleared')}</div>
      )}
    </div>
  );
}
