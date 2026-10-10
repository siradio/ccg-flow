import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';
import Modal from '../../components/Modal';

// Tarifs produit — deux catégories (Commercial / Grossiste). Vue produit-centrée : chaque produit
// fini avec son tarif ACTIF par catégorie. Modifier un tarif ouvre un nouveau tarif daté (le
// précédent est clôturé côté serveur, jamais écrasé). Signale les tarifs manquants.
const fmt = n => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR') + ' GNF');
const CAT_LABEL = { commercial: 'Commercial', grossiste: 'Grossiste' };
const MUTED = { color: 'var(--color-text-muted)', fontSize: 12 };
const today = () => new Date().toISOString().slice(0, 10);

export default function TarifsPage() {
  const { user } = useAuth();
  const canEdit = hasSubModuleLevel(user, 'commerce.parametres', 'edition');
  const [rows, setRows] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [buFilter, setBuFilter] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState(null);       // { product, categorie, prix, date_effet, commentaire }
  const [history, setHistory] = useState(null);  // { product, categorie, items }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    const params = {};
    if (buFilter) params.business_unit_id = buFilter;
    if (q.trim()) params.q = q.trim();
    client.get('/commerce/tarifs', { params })
      .then(r => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }
  useEffect(() => { client.get('/business-units/mine').then(r => setBusinessUnits(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [buFilter]);

  const missing = useMemo(
    () => rows.filter(r => r.prix_commercial == null || r.prix_grossiste == null).length, [rows]);

  function openEdit(product, categorie, currentPrix) {
    setError('');
    setEdit({ product, categorie, prix: currentPrix ?? '', date_effet: today(), commentaire: '' });
  }
  async function save() {
    if (!edit) return;
    const prix = Number(edit.prix);
    if (!Number.isFinite(prix) || prix < 0) { setError('Prix invalide.'); return; }
    setSaving(true); setError('');
    try {
      await client.post('/commerce/tarifs', {
        product_id: edit.product.product_id, categorie_tarif: edit.categorie,
        prix, date_effet: edit.date_effet, commentaire: edit.commentaire || null,
      });
      setEdit(null); load();
    } catch (e) {
      setError(e?.response?.data?.error || "Erreur lors de l'enregistrement.");
    } finally { setSaving(false); }
  }
  function openHistory(product, categorie) {
    client.get('/commerce/tarifs/history', { params: { product_id: product.product_id, categorie } })
      .then(r => setHistory({ product, categorie, items: r.data }))
      .catch(() => setHistory({ product, categorie, items: [] }));
  }

  const colSpan = canEdit ? 6 : 5;
  const PriceCell = ({ prix, date, product, categorie }) => (
    <td style={prix == null ? { background: 'var(--color-danger-soft)' } : undefined}>
      {fmt(prix)}{date && <span style={MUTED}> ({date})</span>}{' '}
      <button className="btn btn-secondary btn-sm" onClick={() => openHistory(product, categorie)}>hist.</button>
    </td>
  );

  return (
    <div>
      <CommerceSubnav />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Tarifs produit</h2>
          {missing > 0 && (
            <span className="badge" style={{ background: 'var(--color-warning, #b45309)', color: '#fff' }}>
              {missing} produit(s) sans tarif complet
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <select value={buFilter} onChange={e => setBuFilter(e.target.value)}>
            <option value="">Toutes les BU</option>
            {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom || b.code}</option>)}
          </select>
          <input placeholder="Rechercher un produit…" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }} />
          <button className="btn btn-secondary btn-sm" onClick={load}>Rechercher</button>
        </div>
        <div className="table-wrap">
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Produit</th><th>BU</th><th>Unité</th>
                <th>Tarif Commercial</th><th>Tarif Grossiste</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={colSpan}>Chargement…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={colSpan}>Aucun produit fini.</td></tr>
                  : rows.map(r => (
                    <tr key={r.product_id}>
                      <td>{r.code ? `${r.code} — ` : ''}{r.designation}</td>
                      <td>{r.business_unit_nom || '—'}</td>
                      <td>{r.unite_vente || r.unite || '—'}</td>
                      <PriceCell prix={r.prix_commercial} date={r.date_effet_commercial} product={r} categorie="commercial" />
                      <PriceCell prix={r.prix_grossiste} date={r.date_effet_grossiste} product={r} categorie="grossiste" />
                      {canEdit && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm" onClick={() => openEdit(r, 'commercial', r.prix_commercial)}>Comm.</button>{' '}
                          <button className="btn btn-sm" onClick={() => openEdit(r, 'grossiste', r.prix_grossiste)}>Gros.</button>
                        </td>
                      )}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (
        <Modal title={`Nouveau tarif ${CAT_LABEL[edit.categorie]} — ${edit.product.designation}`} onClose={() => setEdit(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <label>Prix (GNF)
              <input type="number" min="0" step="any" value={edit.prix} autoFocus
                onChange={e => setEdit({ ...edit, prix: e.target.value })} />
            </label>
            <label>Date d'effet
              <input type="date" value={edit.date_effet}
                onChange={e => setEdit({ ...edit, date_effet: e.target.value })} />
            </label>
            <label>Commentaire
              <input value={edit.commentaire} onChange={e => setEdit({ ...edit, commentaire: e.target.value })} />
            </label>
            {error && <p style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEdit(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
            </div>
          </div>
        </Modal>
      )}

      {history && (
        <Modal wide title={`Historique ${CAT_LABEL[history.categorie]} — ${history.product.designation}`} onClose={() => setHistory(null)}>
          <div className="table-wrap">
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Date d'effet</th><th>Date fin</th><th>Prix</th><th>Statut</th><th>Par</th><th>Commentaire</th></tr></thead>
              <tbody>
                {history.items.length === 0 ? <tr><td colSpan={6}>Aucun historique.</td></tr>
                  : history.items.map(it => (
                    <tr key={it.id}>
                      <td>{it.date_effet}</td><td>{it.date_fin || '—'}</td>
                      <td>{fmt(it.prix)}</td>
                      <td>{it.actif ? 'Actif' : 'Clôturé'}</td>
                      <td>{it.created_by_nom || '—'}</td>
                      <td>{it.commentaire || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
