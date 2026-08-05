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
