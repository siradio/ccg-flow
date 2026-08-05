import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import { ExportButtons } from '../../utils/exportData';

// Refonte Stock — « Relevé du jour » (produits finis). Grille rapide du matin (une ligne par produit,
// une colonne quantité) + suivi Direction comparant le relevé au stock théorique du grand livre.
const today = () => new Date().toISOString().slice(0, 10);
const fmt = n => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const ecartColor = e => (e == null ? 'inherit' : e === 0 ? '#15803d' : e > 0 ? '#1d4ed8' : '#b91c1c');

const SAISIE_COLS = [
  { key: 'code', label: 'Code' }, { key: 'designation', label: 'Produit' },
  { key: 'releve', label: 'Stock du jour', type: 'number' }, { key: 'theorique', label: 'Théorique', type: 'number' },
  { key: 'ecart', label: 'Écart', type: 'number' },
];
const SUIVI_COLS = [
  { key: 'code', label: 'Code' }, { key: 'designation', label: 'Produit' }, { key: 'bu_nom', label: 'Business Unit' },
  { key: 'releve', label: 'Dernier relevé', type: 'number' }, { key: 'date_stock', label: 'Date', type: 'date' },
  { key: 'theorique', label: 'Théorique', type: 'number' }, { key: 'ecart', label: 'Écart', type: 'number' },
];

function Segmented({ tab, setTab }) {
  const tabs = [['saisie', 'Saisie du jour'], ['suivi', 'Suivi Direction']];
  return (
    <div style={{ display: 'inline-flex', gap: 4, background: 'rgba(128,128,128,0.12)', borderRadius: 12, padding: 4, margin: '4px 0 16px' }}>
      {tabs.map(([k, label]) => (
        <button key={k} type="button" onClick={() => setTab(k)}
          style={{ border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 600, fontSize: 13.5, padding: '7px 18px', borderRadius: 9,
            background: tab === k ? 'var(--color-primary, #4f46e5)' : 'transparent', color: tab === k ? '#fff' : 'var(--color-text-muted, #6b7280)',
            boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.18)' : 'none' }}>{label}</button>
      ))}
    </div>
  );
}

export default function StockReleveJour() {
  const { user } = useAuth();
  const canView = hasSubModuleLevel(user, 'stock.releve_jour');
  const canSaisir = hasSubModuleLevel(user, 'stock.releve_jour', 'ajout');

  const [tab, setTab] = useState('saisie');
  const [bus, setBus] = useState([]);
  const [buId, setBuId] = useState('');
  const [date, setDate] = useState(today());
  const [grid, setGrid] = useState([]);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState('');
  const [suiviDate, setSuiviDate] = useState(today());
  const [suiviBu, setSuiviBu] = useState('');
  const [dash, setDash] = useState([]);

  useEffect(() => { if (canView) client.get('/business-units').then(r => { setBus(r.data); if (r.data[0]) setBuId(String(r.data[0].id)); }).catch(() => {}); }, [canView]);

  function loadGrid() {
    if (!buId || !date) return;
    client.get(`/stock-releve/grid?business_unit_id=${buId}&date=${date}`).then(r => {
      setGrid(r.data);
      setEdits(Object.fromEntries(r.data.map(x => [x.product_id, { quantite: x.releve ?? '', commentaire: x.commentaire ?? '' }])));
      setMsg('');
    }).catch(() => {});
  }
  useEffect(() => { if (canView && tab === 'saisie') loadGrid(); /* eslint-disable-next-line */ }, [canView, tab, buId, date]);
  useEffect(() => {
    if (!(canView && tab === 'suivi')) return;
    const qs = `date=${suiviDate}${suiviBu ? `&business_unit_id=${suiviBu}` : ''}`;
    client.get(`/stock-releve/dashboard?${qs}`).then(r => setDash(r.data)).catch(() => {});
  }, [canView, tab, suiviDate, suiviBu]);

  const saisieExport = useMemo(() => grid.map(r => {
    const q = edits[r.product_id]?.quantite;
    return { ...r, releve: q === '' || q == null ? '' : Number(q), ecart: q === '' || q == null ? '' : Number(q) - Number(r.theorique) };
  }), [grid, edits]);

  if (!canView) return <div><StockSectionNav /><p>Le relevé du jour ne vous a pas été accordé.</p></div>;

  async function save() {
    const lines = Object.entries(edits).filter(([, v]) => v.quantite !== '' && v.quantite != null)
      .map(([product_id, v]) => ({ product_id: Number(product_id), quantite: Number(v.quantite), commentaire: v.commentaire }));
    const { data } = await client.put('/stock-releve/grid', { business_unit_id: Number(buId), date, lines });
    setMsg(`${data.saved} relevé(s) enregistré(s).`); loadGrid();
  }

  const nbSaisis = Object.values(edits).filter(v => v.quantite !== '' && v.quantite != null).length;

  return (
    <div>
      <StockSectionNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ margin: '0 0 4px' }}>Relevé du jour</h1>
          <p className="page-subtitle" style={{ margin: '0 0 8px' }}>Stock des produits finis saisi chaque matin, en grille, et comparé au stock théorique.</p>
        </div>
        <ExportButtons filename={tab === 'saisie' ? `releve_${date}` : `suivi_releve_${suiviDate}`}
          columns={tab === 'saisie' ? SAISIE_COLS : SUIVI_COLS} rows={tab === 'saisie' ? saisieExport : dash} />
      </div>
      <Segmented tab={tab} setTab={setTab} />

      {tab === 'saisie' && (
        <>
          <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ minWidth: 180 }}>Business Unit
              <select value={buId} onChange={e => setBuId(e.target.value)}>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}</select>
            </label>
            <label className="field">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
            <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-muted)' }}>{nbSaisis} / {grid.length} produits saisis</div>
          </div>
          {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}
          {grid.length === 0 && <p className="empty-row">Aucun produit fini pour cette BU.</p>}
          {grid.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Produit</th><th className="num">Stock du jour</th><th className="num">Théorique</th><th className="num">Écart</th><th>Commentaire</th></tr></thead>
                  <tbody>
                    {grid.map(r => {
                      const q = edits[r.product_id]?.quantite;
                      const ecart = q === '' || q == null ? null : Number(q) - Number(r.theorique);
                      return (
                        <tr key={r.product_id}>
                          <td><strong>{r.code || ''}</strong>{r.code ? ' — ' : ''}{r.designation}<div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{r.unite || ''}</div></td>
                          <td className="num">
                            <input type="number" step="0.001" disabled={!canSaisir} value={q ?? ''} style={{ width: 100, textAlign: 'right' }}
                              onChange={e => setEdits(x => ({ ...x, [r.product_id]: { ...x[r.product_id], quantite: e.target.value } }))} />
                          </td>
                          <td className="num" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)' }}>{fmt(r.theorique)}</td>
                          <td className="num" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: ecartColor(ecart) }}>{ecart == null ? '—' : (ecart > 0 ? '+' : '') + fmt(ecart)}</td>
                          <td><input disabled={!canSaisir} value={edits[r.product_id]?.commentaire ?? ''} placeholder="optionnel" style={{ width: 160 }}
                            onChange={e => setEdits(x => ({ ...x, [r.product_id]: { ...x[r.product_id], commentaire: e.target.value } }))} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {canSaisir && grid.length > 0 && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={save}>Enregistrer les relevés du {date.split('-').reverse().join('/')}</button>}
        </>
      )}

      {tab === 'suivi' && (
        <>
          <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field">Situation au<input type="date" value={suiviDate} onChange={e => setSuiviDate(e.target.value)} /></label>
            <label className="field" style={{ minWidth: 170 }}>Business Unit
              <select value={suiviBu} onChange={e => setSuiviBu(e.target.value)}>
                <option value="">Toutes</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
            <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-muted)' }}>Dernier relevé connu de chaque produit à cette date</div>
          </div>
          {dash.length === 0 && <p className="empty-row">Aucun relevé enregistré.</p>}
          {dash.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Produit</th><th>BU</th><th className="num">Dernier relevé</th><th>Date</th><th className="num">Théorique</th><th className="num">Écart</th></tr></thead>
                  <tbody>
                    {dash.map(r => (
                      <tr key={r.product_id}>
                        <td><strong>{r.code || ''}</strong>{r.code ? ' — ' : ''}{r.designation}</td>
                        <td>{r.bu_nom}</td>
                        <td className="num" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(r.releve)}</td>
                        <td>{r.date_stock ? String(r.date_stock).slice(0, 10).split('-').reverse().join('/') : '—'}</td>
                        <td className="num" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)' }}>{fmt(r.theorique)}</td>
                        <td className="num" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: ecartColor(Number(r.ecart)) }}>{Number(r.ecart) > 0 ? '+' : ''}{fmt(r.ecart)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
