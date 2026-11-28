import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const TYPES = ['accident_arret', 'accident_sans_arret', 'presque_accident', 'situation_dangereuse'];
const EMPTY = { date_evenement: '', type_evenement: 'presque_accident', business_unit_id: '', unite_travail: '', lieu: '', description: '', jours_perdus: '' };
const dstr = v => (v ? String(v).slice(0, 10) : '');
const nowYear = new Date().getFullYear();
const YEARS = [nowYear - 2, nowYear - 1, nowYear, nowYear + 1];

export default function QhseSstAccidents() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canEdit = hasSubModuleLevel(user, 'qhse.sst_accidents', 'ajout');
  const [list, setList] = useState([]);
  const [bus, setBus] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = () => client.get('/qhse/sst/accidents').then(r => setList(r.data)).catch(() => {});
  useEffect(() => { load(); client.get('/business-units').then(r => setBus(r.data)).catch(() => {}); }, []);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const canEditHours = hasSubModuleLevel(user, 'qhse.sst_accidents', 'ajout');

  async function create(e) {
    e.preventDefault(); setErr('');
    try { await client.post('/qhse/sst/accidents', f); setF(EMPTY); setOpen(false); load(); }
    catch (e2) { setErr(e2.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.ssta.title')}</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t('qhse.ssta.confidHint')}</p>

      <IndicatorsPanel canEdit={canEditHours} />

      {canEdit && <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => setOpen(o => !o)}>{t('qhse.ssta.new')}</button>}

      {open && (
        <div className="card" style={{ maxWidth: 760, marginBottom: 14 }}>
          {err && <div className="alert alert-danger">{err}</div>}
          <form onSubmit={create} className="form-grid" style={{ maxWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.ssta.date')}<input type="date" value={f.date_evenement} onChange={e => set('date_evenement', e.target.value)} /></label>
              <label className="field" style={{ flex: '2 1 220px' }}>{t('qhse.ssta.type')}<select value={f.type_evenement} onChange={e => set('type_evenement', e.target.value)}>{TYPES.map(x => <option key={x} value={x}>{t('qhse.ssttype.' + x)}</option>)}</select></label>
              <label className="field" style={{ flex: '1 1 120px' }}>{t('qhse.ssta.jours')}<input type="number" min="0" value={f.jours_perdus} onChange={e => set('jours_perdus', e.target.value)} /></label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 140px' }}>BU<select value={f.business_unit_id} onChange={e => set('business_unit_id', e.target.value)}><option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
              <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.sstr.unite')}<input value={f.unite_travail} onChange={e => set('unite_travail', e.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.ssta.lieu')}<input value={f.lieu} onChange={e => set('lieu', e.target.value)} /></label>
            </div>
            <label className="field">{t('qhse.ssta.description')} *<textarea rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></label>
            <div><button type="submit" className="btn btn-primary" disabled={!f.description}>{t('qhse.ssta.create')}</button></div>
          </form>
        </div>
      )}

      <h3 style={{ marginBottom: 6 }}>{t('qhse.ssta.listTitle')}</h3>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>N°</th><th>{t('qhse.ssta.date')}</th><th>{t('qhse.ssta.type')}</th><th>{t('qhse.sstr.unite')}</th>
            <th>{t('qhse.ssta.jours')}</th><th>{t('qhse.ana.statut')}</th><th></th>
          </tr></thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id}>
                <td>{a.numero}</td>
                <td>{dstr(a.date_evenement) || '—'}</td>
                <td>{t('qhse.ssttype.' + a.type_evenement)}</td>
                <td>{a.unite_travail || a.bu_nom || '—'}</td>
                <td>{a.jours_perdus ?? '—'}</td>
                <td>{t('qhse.sstastatut.' + a.statut)}</td>
                <td><Link to={`/qhse/sst/accidents/${a.id}`}>{t('qhse.ana.open')}</Link></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.ssta.none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, tone }) {
  const color = tone === 'bad' ? '#b91c1c' : tone === 'warn' ? '#b45309' : 'var(--color-text)';
  return (
    <div className="card" style={{ flex: '1 1 130px', minWidth: 120, padding: '10px 14px' }}>
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      {hint && <div className="muted" style={{ fontSize: 11 }}>{hint}</div>}
    </div>
  );
}

function IndicatorsPanel({ canEdit }) {
  const { t, lang } = useI18n();
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(locale, { month: 'short' }));
  const [annee, setAnnee] = useState(nowYear);
  const [ind, setInd] = useState(null);
  const [hours, setHours] = useState(null);
  const [showHours, setShowHours] = useState(false);
  const [msg, setMsg] = useState('');

  const loadInd = (y) => client.get(`/qhse/sst/accidents/indicators/${y}`).then(r => setInd(r.data)).catch(() => setInd(null));
  const loadHours = (y) => client.get(`/qhse/sst/accidents/hours/${y}`).then(r => setHours(r.data)).catch(() => setHours(null));
  useEffect(() => { loadInd(annee); if (showHours) loadHours(annee); }, [annee]);

  function openHours() { setShowHours(true); if (!hours) loadHours(annee); }
  function setCell(bi, mi, v) {
    setHours(rows => rows.map((r, i) => {
      if (i !== bi) return r;
      const mois = r.mois.slice(); mois[mi] = v === '' ? 0 : Number(v);
      return { ...r, mois, total: mois.reduce((a, b) => a + b, 0) };
    }));
  }
  async function saveHours() {
    const payload = [];
    for (const r of hours) r.mois.forEach((h, i) => payload.push({ business_unit_id: r.business_unit_id, mois: i + 1, heures: h }));
    try {
      const resp = await client.put(`/qhse/sst/accidents/hours/${annee}`, { rows: payload });
      setInd(resp.data); setMsg(t('qhse.ana.saved')); setTimeout(() => setMsg(''), 2500);
    } catch { setMsg(t('rh.saveError')); }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{t('qhse.ssta.indicateurs')}</h3>
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select>
        {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => (showHours ? setShowHours(false) : openHours())}>{showHours ? t('qhse.ssta.hideHours') : t('qhse.ssta.editHours')}</button>}
        {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>{t('qhse.ssta.tfTgHint')}</p>
      {ind && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Tile label={t('qhse.ssta.tf')} value={ind.tf ?? '—'} hint={t('qhse.ssta.tfHint')} tone={ind.tf == null ? null : ind.tf > 20 ? 'bad' : ind.tf > 0 ? 'warn' : null} />
          <Tile label={t('qhse.ssta.tg')} value={ind.tg ?? '—'} hint={t('qhse.ssta.tgHint')} tone={ind.tg == null ? null : ind.tg > 1 ? 'bad' : ind.tg > 0 ? 'warn' : null} />
          <Tile label={t('qhse.ssta.heures')} value={ind.heures ? ind.heures.toLocaleString(locale) : 0} hint={t('qhse.ssta.heuresAnnee')} />
          <Tile label={t('qhse.ssta.accArret')} value={ind.nbAccidentsArret} hint={t('qhse.ssta.accArretHint')} tone={ind.nbAccidentsArret > 0 ? 'warn' : null} />
          <Tile label={t('qhse.ssta.joursPerdus')} value={ind.joursPerdus} hint={t('qhse.ssta.joursHint')} tone={ind.joursPerdus > 0 ? 'warn' : null} />
        </div>
      )}
      {ind && ind.heures === 0 && <div className="alert" style={{ marginTop: 10, fontSize: 13 }}>{t('qhse.ssta.noHours')}</div>}

      {showHours && hours && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t('qhse.ssta.heuresTravaillees')} — {annee}</div>
          <div className="table-wrap"><table><thead><tr>
            <th>BU</th>{months.map((m, i) => <th key={i} style={{ textAlign: 'center' }}>{m}</th>)}<th style={{ textAlign: 'center' }}>{t('qhse.ssta.total')}</th>
          </tr></thead><tbody>
            {hours.map((r, bi) => (
              <tr key={r.business_unit_id}>
                <td style={{ whiteSpace: 'nowrap' }}>{r.bu_nom}</td>
                {r.mois.map((h, mi) => (
                  <td key={mi}><input type="number" min="0" value={h || ''} disabled={!canEdit} onChange={e => setCell(bi, mi, e.target.value)} style={{ width: 62 }} /></td>
                ))}
                <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.total.toLocaleString(locale)}</td>
              </tr>
            ))}
            {hours.length === 0 && <tr><td colSpan={14} className="empty-row">{t('qhse.ssta.noBu')}</td></tr>}
          </tbody></table></div>
          {canEdit && <div style={{ marginTop: 8 }}><button className="btn btn-primary btn-sm" onClick={saveHours}>{t('qhse.ssta.saveHours')}</button></div>}
        </div>
      )}
    </div>
  );
}
