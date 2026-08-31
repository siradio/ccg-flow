import { useState } from 'react';
import * as XLSX from 'xlsx';

// Export générique de tableaux. `columns` = [{ key, label, type? }] avec type = 'number' | 'date'
// pour un rendu propre (nombres numériques dans Excel, dates JJ/MM/AAAA). `rows` = objets.
function cell(value, type) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'number') { const n = Number(value); return Number.isNaN(n) ? value : n; }
  if (type === 'date') return String(value).slice(0, 10).split('-').reverse().join('/');
  return value;
}

export function exportXlsx(filename, columns, rows) {
  const aoa = [columns.map(c => c.label), ...rows.map(r => columns.map(c => cell(r[c.key], c.type)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Export');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}

export function exportCsv(filename, columns, rows) {
  const esc = v => { const s = String(v == null ? '' : v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [columns.map(c => esc(c.label)).join(';'), ...rows.map(r => columns.map(c => esc(cell(r[c.key], c.type))).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }); // BOM pour les accents
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

// Classeur Excel multi-feuilles. `sheets` = [{ name, columns, rows }].
export function exportXlsxSheets(filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = [s.columns.map(c => c.label), ...s.rows.map(r => s.columns.map(c => cell(r[c.key], c.type)))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), (s.name || 'Feuille').slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}

// Construit, à partir d'un détail « une ligne par produit et par jour » (rows =
// [{ date, code, designation, bu_nom, unite, qty }]), deux feuilles :
//  - Matrice : produits en lignes, un jour de saisie par colonne, quantité dans les cellules + Total.
//  - Détail  : liste plate (Date, Code, Produit, Business Unit, <valeur>) — aussi utilisée pour le CSV.
export function dailyDetailSheets(rows, { valueLabel = 'Quantité' } = {}) {
  const day = v => String(v).slice(0, 10);
  const days = [...new Set(rows.map(r => day(r.date)))].sort();
  const dLabel = d => d.split('-').reverse().slice(0, 2).join('/'); // JJ/MM
  const key = r => `${r.bu_nom || ''}|${r.code || ''}|${r.designation || ''}`;
  const prods = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!prods.has(k)) prods.set(k, { code: r.code, designation: r.designation, bu_nom: r.bu_nom, byDay: {}, __total: 0 });
    const p = prods.get(k);
    const d = day(r.date);
    p.byDay[d] = (p.byDay[d] || 0) + Number(r.qty || 0);
    p.__total += Number(r.qty || 0);
  }
  const matrixCols = [
    { key: 'code', label: 'Code' }, { key: 'designation', label: 'Produit' }, { key: 'bu_nom', label: 'Business Unit' },
    ...days.map(d => ({ key: d, label: dLabel(d), type: 'number' })),
    { key: '__total', label: 'Total', type: 'number' },
  ];
  const matrixRows = [...prods.values()].map(p => ({
    code: p.code, designation: p.designation, bu_nom: p.bu_nom, __total: p.__total,
    ...Object.fromEntries(days.map(d => [d, p.byDay[d] ?? ''])),
  }));
  const flatCols = [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'code', label: 'Code' },
    { key: 'designation', label: 'Produit' }, { key: 'bu_nom', label: 'Business Unit' },
    { key: 'qty', label: valueLabel, type: 'number' },
  ];
  const flatRows = rows.map(r => ({ date: day(r.date), code: r.code, designation: r.designation, bu_nom: r.bu_nom, qty: r.qty }));
  return { days, matrix: { name: 'Matrice', columns: matrixCols, rows: matrixRows }, flat: { name: 'Détail', columns: flatCols, rows: flatRows } };
}

// Boutons d'export DÉTAILLÉ (par jour de saisie) : Excel = 2 feuilles (Matrice + Détail), CSV = Détail.
// `fetchRows` renvoie une promesse du détail (voir dailyDetailSheets). `emptyMsg` s'affiche s'il n'y a rien.
export function DetailExportButtons({ filename, fetchRows, valueLabel, disabled, emptyMsg }) {
  const [busy, setBusy] = useState(false);
  async function run(kind) {
    if (busy) return;
    setBusy(true);
    try {
      const rows = await fetchRows();
      if (!rows || rows.length === 0) { if (emptyMsg) alert(emptyMsg); return; }
      const { matrix, flat } = dailyDetailSheets(rows, { valueLabel });
      if (kind === 'xlsx') exportXlsxSheets(filename, [matrix, flat]);
      else exportCsv(filename, flat.columns, flat.rows);
    } catch { if (emptyMsg) alert(emptyMsg); }
    finally { setBusy(false); }
  }
  const off = disabled || busy;
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button className="btn btn-secondary btn-sm" disabled={off} onClick={() => run('xlsx')}>⬇ Excel</button>
      <button className="btn btn-secondary btn-sm" disabled={off} onClick={() => run('csv')}>⬇ CSV</button>
    </span>
  );
}

// Deux petits boutons Excel / CSV réutilisables.
export function ExportButtons({ filename, columns, rows, disabled }) {
  const off = disabled || !rows || rows.length === 0;
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button className="btn btn-secondary btn-sm" disabled={off} onClick={() => exportXlsx(filename, columns, rows)}>⬇ Excel</button>
      <button className="btn btn-secondary btn-sm" disabled={off} onClick={() => exportCsv(filename, columns, rows)}>⬇ CSV</button>
    </span>
  );
}
