import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';

// Import Excel des versements saisis à la main (utile en cas de coupure internet).
// Colonnes du modèle → une ligne = un versement ; les colonnes de montant deviennent les moyens.
const COLS = [
  { key: 'date', header: 'Date', hints: ['date'] },
  { key: 'code_commercial', header: 'Code commercial', hints: ['code'] },
  { key: 'especes', header: 'Espèces', hints: ['espèces', 'especes', 'cash'] },
  { key: 'orange_money', header: 'Orange Money', hints: ['orange', ' om'] },
  { key: 'banque', header: 'Banque', hints: ['banque'] },
  { key: 'credit', header: 'Crédit', hints: ['crédit', 'credit'] },
  { key: 'autres_ecart', header: 'Autres/Écart', hints: ['autre', 'écart', 'ecart'] },
  { key: 'banque_nom', header: 'Banque (nom)', hints: ['banque (nom)', 'nom banque', 'bank'] },
  { key: 'reference', header: 'Référence', hints: ['référence', 'reference', 'ref'] },
  { key: 'commentaire', header: 'Commentaire', hints: ['commentaire', 'observation'] },
];
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const money = (n) => (Number(n) || 0).toLocaleString('fr-FR');

function isoDate(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

export default function CommerceImport() {
  const { user } = useAuth();
  const [commerciaux, setCommerciaux] = useState([]);
  const [rows, setRows] = useState([]);      // lignes mappées prêtes à envoyer
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canAdd = hasSubModuleLevel(user, 'commerce.versements', 'ajout');

  useEffect(() => { client.get('/commerce/commerciaux').then(r => setCommerciaux(r.data)).catch(() => {}); }, []);

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const example = commerciaux[0]?.code || 'C0110';
    const header = COLS.map(c => c.header);
    const sample = ['2026-08-25', example, 5000000, 2000000, 0, 0, 0, '', 'Caisse', 'RAS'];
    const ws = XLSX.utils.aoa_to_sheet([header, sample]);
    ws['!cols'] = COLS.map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Versements');
    // Feuille de référence : codes commerciaux valides.
    const ref = [['Code', 'Commercial', 'BU'], ...commerciaux.map(c => [c.code, `${c.prenom_affiche || ''} ${c.nom_affiche || ''}`.trim(), c.business_unit_nom || ''])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ref), 'Commerciaux');
    XLSX.writeFile(wb, 'Modele_versements_CCG_Flow.xlsx');
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setReport(null); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames.find(n => /versement/i.test(n)) || wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
        if (!raw.length) { setError('Feuille vide.'); return; }
        // Auto-mapping en-tête → champ
        const headers = Object.keys(raw[0]);
        const map = {};
        for (const col of COLS) {
          const h = headers.find(hd => { const n = norm(hd); return n === norm(col.header) || col.hints.some(x => n.includes(norm(x))); });
          if (h) map[col.key] = h;
        }
        const mapped = raw.map((r, i) => {
          const o = { __ligne: i + 2 };
          for (const col of COLS) o[col.key] = map[col.key] ? r[map[col.key]] : '';
          o.date = isoDate(o.date);
          return o;
        }).filter(o => o.code_commercial || COLS.slice(2, 7).some(c => Number(String(o[c.key]).replace(/[^\d.-]/g, '')) > 0));
        setRows(mapped);
      } catch (err) { setError('Fichier illisible : ' + (err.message || '')); }
    };
    reader.readAsArrayBuffer(file);
  }

  async function doImport() {
    setBusy(true); setError(''); setReport(null);
    try {
      const res = await client.post('/commerce/versements/import', { rows });
      setReport(res.data);
      setRows([]); setFileName('');
    } catch (e) { setError(e.response?.data?.error || 'Import impossible.'); }
    finally { setBusy(false); }
  }

  const total = useMemo(() => rows.reduce((s, r) => s + COLS.slice(2, 7).reduce((a, c) => a + (Number(String(r[c.key]).replace(/[^\d.-]/g, '')) || 0), 0), 0), [rows]);

  return (
    <div>
      <CommerceSubnav />
      <h1 className="page-title">Import des versements (Excel)</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 720, marginTop: 0 }}>
        En cas de coupure internet, saisissez les versements dans le modèle Excel, puis importez-le ici.
        Une ligne = un versement ; les colonnes Espèces / Orange Money / Banque / Crédit / Autres-Écart
        deviennent les moyens. Le code commercial doit exister (voir la feuille « Commerciaux » du modèle).
      </p>
      {error && <div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div>}

      <section className="card" style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={downloadTemplate}>⬇️ Télécharger le modèle Excel</button>
          <label className="btn btn-primary" style={{ cursor: canAdd ? 'pointer' : 'not-allowed', opacity: canAdd ? 1 : 0.5 }}>
            📄 Choisir un fichier rempli
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} disabled={!canAdd} onChange={onFile} />
          </label>
          {fileName && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{fileName} — {rows.length} ligne(s)</span>}
        </div>
      </section>

      {rows.length > 0 && (
        <section className="card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Prévisualisation ({rows.length} lignes — total {money(total)} GNF)</h2>
            <button className="btn btn-primary" disabled={busy} onClick={doImport}>{busy ? 'Import…' : `Importer ${rows.length} versement(s)`}</button>
          </div>
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table className="table" style={{ width: '100%', fontSize: 13 }}>
              <thead><tr><th>Date</th><th>Code</th><th style={{ textAlign: 'right' }}>Espèces</th><th style={{ textAlign: 'right' }}>Orange</th><th style={{ textAlign: 'right' }}>Banque</th><th style={{ textAlign: 'right' }}>Crédit</th><th style={{ textAlign: 'right' }}>Autres/Écart</th><th>Réf.</th></tr></thead>
              <tbody>
                {rows.slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td><td>{r.code_commercial}</td>
                    <td style={{ textAlign: 'right' }}>{money(r.especes)}</td><td style={{ textAlign: 'right' }}>{money(r.orange_money)}</td>
                    <td style={{ textAlign: 'right' }}>{money(r.banque)}</td><td style={{ textAlign: 'right' }}>{money(r.credit)}</td>
                    <td style={{ textAlign: 'right' }}>{money(r.autres_ecart)}</td><td>{r.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 12 && <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>… et {rows.length - 12} autre(s) ligne(s).</p>}
          </div>
        </section>
      )}

      {report && (
        <section className="card" style={{ marginTop: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Rapport d'import</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: '1 1 120px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Total lignes</div><div style={{ fontSize: 20, fontWeight: 700 }}>{report.total}</div></div>
            <div className="card" style={{ flex: '1 1 120px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Importées</div><div style={{ fontSize: 20, fontWeight: 700, color: '#128a54' }}>{report.inserted}</div></div>
            <div className="card" style={{ flex: '1 1 120px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Ignorées (vides)</div><div style={{ fontSize: 20, fontWeight: 700, color: '#6b7280' }}>{report.skipped}</div></div>
            <div className="card" style={{ flex: '1 1 120px' }}><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Erreurs</div><div style={{ fontSize: 20, fontWeight: 700, color: report.errors.length ? '#dc2626' : '#128a54' }}>{report.errors.length}</div></div>
          </div>
          {report.errors.length > 0 && (
            <table className="table" style={{ width: '100%', marginTop: 12 }}>
              <thead><tr><th>Ligne</th><th>Erreur</th></tr></thead>
              <tbody>{report.errors.map((e, i) => <tr key={i}><td>{e.ligne}</td><td style={{ color: '#dc2626' }}>{e.message}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
