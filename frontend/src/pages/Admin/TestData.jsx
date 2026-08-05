import { useState } from 'react';
import client from '../../api/client';
import { useConfirm } from '../../components/ConfirmProvider.jsx';

// Réservé au super_admin (lien de nav masqué pour les autres, backend gate via requireSuperAdmin) —
// génère/efface des demandes d'achat de test via le VRAI circuit (purchase-requests.service.js),
// jamais des lignes SQL à la main, pour ne jamais dériver des règles métier réelles. Le vidage ne
// touche jamais aux référentiels (fournisseurs, produits, entités...) ni aux comptes utilisateurs.
export default function TestData() {
  const confirm = useConfirm();
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
      setError(err.response?.data?.error || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  async function clearTestData() {
    const ok = await confirm(
      "Vider les données de test ? Ceci supprime DÉFINITIVEMENT toutes les demandes d'achat (devis, " +
      'bons de commande, pièces jointes, historique), les saisies de stock, l\'historique des prix et ' +
      'les notifications. Les référentiels (entités, sites, produits, fournisseurs) et les comptes ' +
      'utilisateurs ne sont PAS touchés. Cette action est irréversible.',
      { danger: true, confirmLabel: 'Vider' }
    );
    if (!ok) return;
    setError('');
    setResult(null);
    setClearing(true);
    try {
      await client.post('/test-data/clear');
      setResult({ type: 'clear' });
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue.');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 4 }}>Données de test</h1>
      <p className="page-subtitle" style={{ marginBottom: 20, maxWidth: 600 }}>
        Outils réservés au super_admin pour peupler ou nettoyer rapidement l'environnement pendant
        les tests, sans toucher aux référentiels ni aux comptes utilisateurs.
      </p>

      <section className="card" style={{ maxWidth: 560 }}>
        <h2>Charger des données de test</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Génère un lot de demandes d'achat réparties sur les entités existantes, à différents
          statuts (brouillon, en attente de validation, consultation en cours, devis sélectionné,
          en validation, bon de commande généré) — via le circuit réel, pas des lignes insérées
          directement en base.
        </p>
        <button className="btn btn-primary" onClick={loadSampleData} disabled={loading}>
          {loading ? 'Génération…' : 'Charger des données de test'}
        </button>
      </section>

      <section className="card" style={{ maxWidth: 560 }}>
        <h2>Vider les données de test</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Supprime toutes les demandes d'achat, saisies de stock, historique des prix et
          notifications — pour repartir d'un environnement propre. Les référentiels et les comptes
          utilisateurs restent intacts.
        </p>
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          ⚠️ Action irréversible — à utiliser uniquement en environnement de test.
        </div>
        <button className="btn btn-danger" onClick={clearTestData} disabled={clearing}>
          {clearing ? 'Suppression…' : 'Vider les données de test'}
        </button>
      </section>

      {error && <div className="alert alert-danger" style={{ maxWidth: 560 }}>{error}</div>}

      {result?.type === 'load' && (
        <div className="alert alert-success" style={{ maxWidth: 560 }}>
          {result.created} demande(s) d'achat créée(s).
          {result.skipped?.length > 0 && (
            <>
              <br />Ignoré (données insuffisantes) :
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {result.skipped.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
      {result?.type === 'clear' && (
        <div className="alert alert-success" style={{ maxWidth: 560 }}>Données de test supprimées.</div>
      )}
    </div>
  );
}
