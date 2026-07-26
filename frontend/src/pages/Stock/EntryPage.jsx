import { useEffect, useState } from 'react';
import client from '../../api/client';
import StockSectionNav from './StockSectionNav';
import StockSubnav from './StockSubnav';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function draftsFromProducts(products) {
  const d = {};
  for (const p of products) {
    d[p.product_id] = { quantite: p.quantite ?? '', unite: p.unite ?? '', commentaire: p.commentaire ?? '' };
  }
  return d;
}

export default function EntryPage() {
  const [businessUnits, setBusinessUnits] = useState([]);
  const [date, setDate] = useState(today());
  const [businessUnitId, setBusinessUnitId] = useState('');
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [justSavedId, setJustSavedId] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/stock/business-units').then(res => {
      setBusinessUnits(res.data);
      if (res.data.length === 1) setBusinessUnitId(String(res.data[0].id));
    });
  }, []);

  useEffect(() => {
    if (!businessUnitId) { setSheet(null); return; }
    setLoading(true);
    setError('');
    setSavedAt(null);
    client.get('/stock/day', { params: { date, business_unit_id: businessUnitId } })
      .then(res => { setSheet(res.data); setDrafts(draftsFromProducts(res.data.products)); })
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement.'))
      .finally(() => setLoading(false));
  }, [date, businessUnitId]);

  function setDraft(productId, field, value) {
    setDrafts(d => ({ ...d, [productId]: { ...d[productId], [field]: value } }));
    setSavedAt(null);
  }

  async function saveRow(row) {
    const draft = drafts[row.product_id];
    if (!draft || draft.quantite === '' || draft.quantite === null) return;
    setSavingId(row.product_id);
    setError('');
    setRowErrors(e => ({ ...e, [row.product_id]: null }));
    try {
      const res = await client.post('/stock/entries', {
        date,
        productId: row.product_id,
        quantite: Number(draft.quantite),
        unite: draft.unite || null,
        commentaire: draft.commentaire || null,
      });
      setSheet(s => ({
        ...s,
        products: s.products.map(p => p.product_id === row.product_id
          ? { ...p, entry_id: res.data.id, quantite: res.data.quantite, unite: res.data.unite, commentaire: res.data.commentaire, updated_at: res.data.updated_at }
          : p),
      }));
      setSavedAt(new Date());
      // Confirmation directement sur la ligne : la bannière du haut est invisible quand on a
      // fait défiler une grille longue, ce qui donnait l'impression que le clic ne faisait rien.
      setJustSavedId(row.product_id);
      setTimeout(() => setJustSavedId(id => (id === row.product_id ? null : id)), 2000);
    } catch (err) {
      const msg = err.response?.data?.error || "Erreur lors de l'enregistrement.";
      setError(msg);
      setRowErrors(e => ({ ...e, [row.product_id]: msg }));
    } finally {
      setSavingId(null);
    }
  }

  const selectedBu = businessUnits.find(b => String(b.id) === String(businessUnitId));

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>Stock</h1>
      <StockSectionNav />
      <StockSubnav />

      <div className="form-inline" style={{ marginBottom: 16 }}>
        <label className="field" style={{ minWidth: 160 }}>
          Date
          <input type="date" value={date} onChange={e => setDate(e.target.value)} max={today()} />
        </label>
        <label className="field" style={{ minWidth: 220 }}>
          Business Unit
          <select value={businessUnitId} onChange={e => setBusinessUnitId(e.target.value)}>
            <option value="">Sélectionner…</option>
            {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {savedAt && <div className="alert alert-success">Enregistré ✓</div>}

      {!businessUnitId ? (
        <div className="card">
          <EmptyState title="Choisissez une Business Unit pour afficher la grille de saisie du jour." />
        </div>
      ) : loading ? (
        <div className="card"><Loading /></div>
      ) : sheet && (
        <div className="card" style={{ padding: 0 }}>
          {!sheet.canWrite && (
            <div className="alert alert-danger" style={{ margin: 16, marginBottom: 0 }}>
              Lecture seule : cette Business Unit ne vous a pas été explicitement accordée en écriture.
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Quantité en stock</th>
                  <th>Unité</th>
                  <th>Commentaire</th>
                  {sheet.canWrite && <th />}
                </tr>
              </thead>
              <tbody>
                {sheet.products.map(row => {
                  const draft = drafts[row.product_id] || { quantite: '', unite: '', commentaire: '' };
                  const currentQty = draft.quantite !== '' ? Number(draft.quantite) : (row.quantite != null ? Number(row.quantite) : null);
                  const low = row.seuil_alerte_stock != null && currentQty != null && currentQty < Number(row.seuil_alerte_stock);
                  const rowError = rowErrors[row.product_id];
                  const justSaved = justSavedId === row.product_id;
                  const rowStyle = rowError
                    ? { background: 'var(--color-danger-soft)' }
                    : justSaved
                      ? { background: 'var(--color-success-bg)' }
                      : low ? { background: 'var(--color-danger-soft)' } : undefined;
                  return (
                    <tr key={row.product_id} style={rowStyle}>
                      <td>{row.designation}{row.code ? ` (${row.code})` : ''}</td>
                      <td>
                        {sheet.canWrite ? (
                          <input type="number" value={draft.quantite} style={{ width: 110 }}
                            onChange={e => setDraft(row.product_id, 'quantite', e.target.value)} />
                        ) : (row.quantite ?? '—')}
                      </td>
                      <td>
                        {sheet.canWrite ? (
                          <input value={draft.unite} style={{ width: 90 }}
                            onChange={e => setDraft(row.product_id, 'unite', e.target.value)} />
                        ) : (row.unite || '—')}
                      </td>
                      <td>
                        {sheet.canWrite ? (
                          <input value={draft.commentaire} style={{ width: 160 }}
                            onChange={e => setDraft(row.product_id, 'commentaire', e.target.value)} />
                        ) : (row.commentaire || '—')}
                      </td>
                      {sheet.canWrite && (
                        <td>
                          <button
                            className={justSaved ? 'btn btn-sm' : 'btn btn-primary btn-sm'}
                            style={justSaved ? { background: 'var(--color-success-fg)', color: '#fff', borderColor: 'var(--color-success-fg)' } : undefined}
                            disabled={savingId === row.product_id || draft.quantite === ''}
                            onClick={() => saveRow(row)}
                          >
                            {savingId === row.product_id ? '…' : justSaved ? 'Enregistré ✓' : row.entry_id ? 'Mettre à jour' : 'Enregistrer'}
                          </button>
                          {rowError && <div style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 4, maxWidth: 160 }}>{rowError}</div>}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {sheet.products.length === 0 && (
                  <tr><td className="empty-row" colSpan={sheet.canWrite ? 5 : 4}>Aucun produit actif pour {selectedBu?.nom}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
