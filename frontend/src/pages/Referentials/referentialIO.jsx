import { useState } from 'react';
import * as XLSX from 'xlsx';
import client from '../../api/client';
import Modal from '../../components/Modal.jsx';
import { exportXlsx, exportXlsxSheets } from '../../utils/exportData.jsx';
import { useI18n } from '../../i18n/I18nContext';
import {
  fieldLabel, importableFields, exportableFields, columnsFor,
  exportValue, acceptedValuesRows, rowToPayload, mapHeaders,
} from './referentialIO.core.js';

// Import / Export / Modèle Excel génériques pour un référentiel (piloté par la config `fields` de
// ReferentialPage). Tout se fait côté navigateur : SheetJS parse le fichier, la logique pure de
// referentialIO.core résout les libellés en identifiants, puis on crée ligne par ligne via les
// endpoints CRUD existants (création uniquement). Un rapport détaille succès et échecs par ligne.

export function exportReferential(title, items, fields, ctx, t) {
  const cols = columnsFor(exportableFields(fields), t);
  const rows = items.map(it => Object.fromEntries(exportableFields(fields).map(f => [f.key, exportValue(f, it, ctx)])));
  exportXlsx(`${title}.xlsx`, cols, rows);
}

export function downloadTemplate(title, fields, ctx, t) {
  const cols = columnsFor(importableFields(fields), t);
  const help = acceptedValuesRows(fields, ctx, t);
  const sheets = [{ name: t('ref.io.sheetTemplate'), columns: cols, rows: [] }];
  if (help.length) {
    sheets.push({
      name: t('ref.io.sheetHelp'),
      columns: [{ key: 'col', label: t('ref.io.helpCol') }, { key: 'val', label: t('ref.io.helpVal') }],
      rows: help,
    });
  }
  exportXlsxSheets(`${t('ref.io.templatePrefix')} ${title}.xlsx`, sheets);
}

export function ReferentialImportModal({ endpoint, fields, ctx, title, onClose, onDone }) {
  const { t } = useI18n();
  const [rows, setRows] = useState(null);
  const [mapInfo, setMapInfo] = useState(null);
  const [fileErr, setFileErr] = useState('');
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const fLabel = (f) => fieldLabel(f, t);

  async function onFile(file) {
    if (!file) return;
    setFileErr(''); setReport(null); setRows(null); setMapInfo(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
      if (!json.length) { setFileErr(t('ref.io.err.empty')); return; }
      const hdrs = Object.keys(json[0]);
      const { headerByField, missing } = mapHeaders(fields, hdrs, t);
      const matched = importableFields(fields).filter(f => headerByField[f.key]);
      const unmatched = hdrs.filter(h => !Object.values(headerByField).includes(h));
      setRows(json);
      setMapInfo({ headerByField, missing, matched, unmatched, count: json.length });
    } catch { setFileErr(t('ref.io.err.parse')); }
  }

  async function run() {
    if (!rows || !mapInfo || running) return;
    setRunning(true);
    const rep = { total: rows.length, success: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      try {
        const payload = rowToPayload(rows[i], fields, mapInfo.headerByField, ctx, t);
        await client.post(endpoint, payload);
        rep.success += 1;
      } catch (e) {
        const motif = e.response?.data?.error || e.message || t('ref.error');
        rep.errors.push({ ligne: i + 2, motif });
      }
    }
    setReport(rep); setRunning(false);
    if (rep.success > 0 && onDone) onDone();
  }

  return (
    <Modal title={`${t('ref.io.importTitle')} — ${title}`} onClose={onClose} wide>
      {!report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>{t('ref.io.importIntro')}</p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={e => onFile(e.target.files?.[0])} />
          {fileErr && <div className="alert alert-danger">{fileErr}</div>}
          {mapInfo && (
            <div style={{ fontSize: 13 }}>
              <p style={{ margin: '4px 0' }}>{t('ref.io.detected', { n: mapInfo.count })}</p>
              {mapInfo.missing.length > 0 && (
                <div className="alert alert-danger">{t('ref.io.missingCols')} : {mapInfo.missing.map(fLabel).join(', ')}</div>
              )}
              <p style={{ margin: '4px 0', color: 'var(--color-text-muted)' }}>
                {t('ref.io.matchedCols')} : {mapInfo.matched.map(fLabel).join(', ') || '—'}
              </p>
              {mapInfo.unmatched.length > 0 && (
                <p style={{ margin: '4px 0', color: 'var(--color-text-muted)' }}>{t('ref.io.ignoredCols')} : {mapInfo.unmatched.join(', ')}</p>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={!rows || running || (mapInfo && mapInfo.missing.length > 0)} onClick={run}>
              {running ? t('ref.io.importing') : t('ref.io.importBtn')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={running}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="badge">{t('ref.io.repTotal', { n: report.total })}</span>
            <span className="badge" style={{ background: 'var(--color-success-bg, #dcfce7)' }}>{t('ref.io.repSuccess', { n: report.success })}</span>
            <span className="badge" style={{ background: report.errors.length ? 'var(--color-danger-bg, #fee2e2)' : undefined }}>{t('ref.io.repFail', { n: report.errors.length })}</span>
          </div>
          {report.errors.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
              <table>
                <thead><tr><th>{t('ref.io.line')}</th><th>{t('ref.io.reason')}</th></tr></thead>
                <tbody>{report.errors.map((e, i) => <tr key={i}><td>{e.ligne}</td><td>{e.motif}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div><button type="button" className="btn btn-primary" onClick={onClose}>{t('common.close')}</button></div>
        </div>
      )}
    </Modal>
  );
}
