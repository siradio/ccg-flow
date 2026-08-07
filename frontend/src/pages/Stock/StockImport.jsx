import { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import { useI18n } from '../../i18n/I18nContext';

// Refonte Stock (Lot 5) — Assistant d'import des mouvements (fichiers « Mvt Stock Online <BU> »).
// Le fichier est parsé côté navigateur (SheetJS) ; l'utilisateur mappe les colonnes puis lance
// l'import. Le backend valide/insère et renvoie un rapport. Modèle téléchargeable pour cadrer.
// Libellés de champ traduits via t(f.labelKey) ; les `hints` (détection auto) restent en FR.
const FIELDS = [
  { key: 'date', labelKey: 'fields.date', hints: ['date'] },
  { key: 'product_code', labelKey: 'fields.productCode', hints: ['id produit', 'code', 'id'] },
  { key: 'product_designation', labelKey: 'fields.productDesignation', hints: ['description', 'désignation', 'designation', 'produit'] },
  { key: 'type', labelKey: 'fields.type', hints: ['type'] },
  { key: 'quantite', labelKey: 'fields.quantity', hints: ['quant', 'qté', 'qte'] },
  { key: 'localisation', labelKey: 'fields.location', hints: ['localisation', 'entrepot', 'entrepôt', 'emplacement'] },
  { key: 'commentaire', labelKey: 'fields.comment', hints: ['comment'] },
  { key: 'valeur', labelKey: 'fields.value', hints: ['valeur', 'montant'] },
];

const isoDate = v => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
};

export default function StockImport() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canImport = hasSubModuleLevel(user, 'stock.import', 'ajout');

  const [bus, setBus] = useState([]);
  const [buId, setBuId] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheet, setSheet] = useState('');
  const [wb, setWb] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [data, setData] = useState([]);
  const [mapping, setMapping] = useState({});
  const [opts, setOpts] = useState({ create_missing_products: true, create_missing_locations: true });
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { client.get('/business-units').then(r => setBus(r.data)).catch(() => {}); }, []);

  if (!hasSubModuleLevel(user, 'stock.import')) return <div><StockSectionNav /><p>{t('imp.notAllowed')}</p></div>;

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Date', 'ID Produit', 'Description Produit', 'Type Mouvement', 'Quantité', 'Localisation', 'Commentaire', 'Valeur'],
      ['2026-05-02', 'MAY_01', 'BEST MAYO 500ml', 'Entrée', 150, 'Entrepot Mayo Kagbelin', 'Réception', 18000000],
      ['2026-05-03', 'MAY_01', 'BEST MAYO 500ml', 'Sortie', 40, 'Entrepot Mayo Kagbelin', 'Vente', 4800000],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ws, 'MvtStock');
    XLSX.writeFile(book, 'modele_import_mouvements_stock.xlsx');
  }

  function autoMap(hdrs) {
    const m = {};
    FIELDS.forEach(f => {
      const found = hdrs.find(h => f.hints.some(hint => String(h).toLowerCase().includes(hint)));
      if (found) m[f.key] = found;
    });
    return m;
  }

  function loadSheet(book, name) {
    const ws = book.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    // Certains fichiers ont une ligne de titre : on repère la vraie ligne d'en-tête via sheet_to_json
    // par clés. Ici sheet_to_json prend la 1re ligne comme en-tête — suffisant pour le modèle et MvtStock.
    const hdrs = rows.length ? Object.keys(rows[0]) : [];
    setHeaders(hdrs); setData(rows); setMapping(autoMap(hdrs));
  }

  async function onFile(e) {
    setError(''); setReport(null);
    const file = e.target.files[0]; if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const book = XLSX.read(buf, { type: 'array', cellDates: true });
    setWb(book); setSheets(book.SheetNames);
    const def = book.SheetNames.find(n => /mvt|mouvement/i.test(n)) || book.SheetNames[0];
    setSheet(def); loadSheet(book, def);
  }

  const mappedPreview = useMemo(() => data.slice(0, 8).map(row => {
    const o = {}; FIELDS.forEach(f => { o[f.key] = mapping[f.key] ? row[mapping[f.key]] : ''; }); return o;
  }), [data, mapping]);

  async function doImport() {
    setError(''); setBusy(true); setReport(null);
    try {
      const rows = data.map(row => ({
        date: isoDate(mapping.date ? row[mapping.date] : ''),
        product_code: mapping.product_code ? row[mapping.product_code] : '',
        product_designation: mapping.product_designation ? row[mapping.product_designation] : '',
        type: mapping.type ? row[mapping.type] : '',
        quantite: mapping.quantite ? row[mapping.quantite] : '',
        localisation: mapping.localisation ? row[mapping.localisation] : '',
        commentaire: mapping.commentaire ? row[mapping.commentaire] : '',
        valeur: mapping.valeur ? row[mapping.valeur] : '',
      })).filter(r => r.quantite !== '' && (r.product_code || r.product_designation));
      const { data: rep } = await client.post('/stock-import/movements', {
        business_unit_id: Number(buId), rows,
        create_missing_products: opts.create_missing_products, create_missing_locations: opts.create_missing_locations,
      });
      setReport(rep);
    } catch (err) { setError(err.response?.data?.error || t('imp.importError')); }
    finally { setBusy(false); }
  }

  const ready = buId && data.length && mapping.type && mapping.quantite && (mapping.product_code || mapping.product_designation);

  return (
    <div>
      <StockSectionNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{t('imp.title')}</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{t('imp.subtitle')}</p>
        </div>
        <button className="btn btn-secondary" onClick={downloadTemplate}>{t('imp.downloadTemplate')}</button>
      </div>

      {!canImport && <div className="alert alert-warning" style={{ marginBottom: 12 }}>{t('imp.readonly')}</div>}

      <section className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ minWidth: 200 }}>{t('imp.buTarget')}
            <select value={buId} onChange={e => setBuId(e.target.value)} required>
              <option value="" disabled>{t('imp.chooseBu')}</option>
              {bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 240 }}>{t('imp.file')}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
          </label>
          {sheets.length > 1 && (
            <label className="field" style={{ minWidth: 160 }}>{t('imp.sheet')}
              <select value={sheet} onChange={e => { setSheet(e.target.value); loadSheet(wb, e.target.value); }}>
                {sheets.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>
        {fileName && <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>{t('imp.detected', { file: fileName, n: data.length })}</p>}
      </section>

      {headers.length > 0 && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>{t('imp.mapping')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {FIELDS.map(f => (
              <label key={f.key} className="field">{t(f.labelKey)}{['type', 'quantite'].includes(f.key) ? ' *' : ''}
                <select value={mapping[f.key] || ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">{t('imp.ignore')}</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input type="checkbox" checked={opts.create_missing_products} onChange={e => setOpts(o => ({ ...o, create_missing_products: e.target.checked }))} /> {t('imp.createProducts')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input type="checkbox" checked={opts.create_missing_locations} onChange={e => setOpts(o => ({ ...o, create_missing_locations: e.target.checked }))} /> {t('imp.createLocations')}
            </label>
          </div>
        </section>
      )}

      {mappedPreview.length > 0 && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>{t('imp.preview')}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr>{FIELDS.map(f => <th key={f.key}>{t(f.labelKey)}</th>)}</tr></thead>
              <tbody>{mappedPreview.map((r, i) => <tr key={i}>{FIELDS.map(f => <td key={f.key}>{f.key === 'date' ? isoDate(r[f.key]) : String(r[f.key] ?? '')}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

      {data.length > 0 && canImport && (
        <button className="btn btn-primary" disabled={!ready || busy} onClick={doImport}>
          {busy ? t('imp.importing') : t('imp.importBtn', { n: data.length })}
        </button>
      )}

      {report && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>{t('imp.report')}</h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <Stat label={t('imp.stat.total')} value={report.total} />
            <Stat label={t('imp.stat.imported')} value={report.inserted} color="#15803d" />
            <Stat label={t('imp.stat.skipped')} value={report.skipped} color={report.skipped ? '#b45309' : undefined} />
            <Stat label={t('imp.stat.createdProducts')} value={report.created_products} />
            <Stat label={t('imp.stat.createdLocations')} value={report.created_locations} />
          </div>
          {report.errors?.length > 0 && (
            <>
              <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>{t('imp.skippedRows', { n: report.errors.length })}</h3>
              <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table><thead><tr><th>{t('imp.th.line')}</th><th>{t('imp.th.reason')}</th></tr></thead>
                  <tbody>{report.errors.slice(0, 200).map((e, i) => <tr key={i}><td>{e.ligne}</td><td>{e.message}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '8px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'inherit', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
