import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { ExportButtons } from '../../utils/exportData';
import { useI18n } from '../../i18n/I18nContext';

// Module Production — relevé de production journalière (flux) + suivi cumulé sur une période.
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';
const fmt = n => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const d10 = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');

const SAISIE_COLS = [{ key: 'code', label: 'Code' }, { key: 'designation', label: 'Produit' }, { key: 'produit', label: 'Produit ce jour', type: 'number' }];
const SUIVI_COLS = [
  { key: 'code', label: 'Code' }, { key: 'designation', label: 'Produit' }, { key: 'bu_nom', label: 'Business Unit' },
  { key: 'total_produit', label: 'Total produit', type: 'number' }, { key: 'jours_saisis', label: 'Jours saisis', type: 'number' },
  { key: 'dernier_jour', label: 'Dernier jour', type: 'date' }, { key: 'saisi_par', label: 'Par' },
];

function Segmented({ tab, setTab }) {
  const { t } = useI18n();
  const tabs = [['saisie', t('stockreleve.tab.saisie')], ['suivi', t('stockreleve.tab.suivi')]];
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

export default function ProductionReleve() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canView = hasSubModuleLevel(user, 'production.releve') || hasSubModuleLevel(user, 'production.suivi');
  const canSaisir = hasSubModuleLevel(user, 'production.releve', 'ajout');
  const canSuivi = hasSubModuleLevel(user, 'production.suivi');

  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('vue') === 'suivi' || !hasSubModuleLevel(user, 'production.releve') ? 'suivi' : 'saisie');
  const [bus, setBus] = useState([]);
  const [buId, setBuId] = useState('');
  const [date, setDate] = useState(today());
  const [grid, setGrid] = useState([]);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState(null); // { type: 'success' | 'error', text }
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState({ from: monthStart(), to: today(), bu: '' });
  const [suivi, setSuivi] = useState([]);
  const [evoGran, setEvoGran] = useState('semaine');
  const [evoProduct, setEvoProduct] = useState('');
  const [evo, setEvo] = useState([]);

  useEffect(() => { if (canView) client.get('/business-units').then(r => { setBus(r.data); if (r.data[0]) setBuId(String(r.data[0].id)); }).catch(() => {}); }, [canView]);

  function loadGrid() {
    if (!buId || !date) return;
    client.get(`/production/grid?business_unit_id=${buId}&date=${date}`).then(r => {
      setGrid(r.data);
      setEdits(Object.fromEntries(r.data.map(x => [x.product_id, { quantite: x.produit ?? '', commentaire: x.commentaire ?? '' }])));
      // Ne pas vider `msg` ici : loadGrid est rappelé après un enregistrement réussi, on garde la
      // confirmation. Le message est réinitialisé au changement de BU/date.
    }).catch(() => {});
  }
  useEffect(() => { if (canView && tab === 'saisie') loadGrid(); /* eslint-disable-next-line */ }, [canView, tab, buId, date]);
  useEffect(() => {
    if (!canSuivi || tab !== 'suivi') return;
    const qs = `date_from=${period.from}&date_to=${period.to}${period.bu ? `&business_unit_id=${period.bu}` : ''}`;
    client.get(`/production/dashboard?${qs}`).then(r => setSuivi(r.data)).catch(() => {});
  }, [canSuivi, tab, period]);
  useEffect(() => {
    if (!canSuivi || tab !== 'suivi' || !period.from) { setEvo([]); return; }
    const qs = `granularity=${evoGran}&date_from=${period.from}&date_to=${period.to}${period.bu ? `&business_unit_id=${period.bu}` : ''}${evoProduct ? `&product_id=${evoProduct}` : ''}`;
    client.get(`/production/evolution?${qs}`).then(r => setEvo(r.data)).catch(() => setEvo([]));
  }, [canSuivi, tab, period, evoGran, evoProduct]);

  if (!canView) return <p>{t('prodrel.notAllowed')}</p>;

  async function save() {
    if (saving) return; // garde-fou anti double-clic
    const lines = Object.entries(edits).filter(([, v]) => v.quantite !== '' && v.quantite != null)
      .map(([product_id, v]) => ({ product_id: Number(product_id), quantite: Number(v.quantite), commentaire: v.commentaire }));
    setSaving(true); setMsg(null);
    try {
      const { data } = await client.put('/production/grid', { business_unit_id: Number(buId), date, lines });
      setMsg({ type: 'success', text: t('prodrel.saved', { n: data.saved }) });
      loadGrid();
    } catch (e) {
      setMsg({ type: 'error', text: t('stockreleve.saveError', { err: e.response?.data?.error || t('stockreleve.serverError') }) });
    } finally {
      setSaving(false);
    }
  }

  const nbSaisis = Object.values(edits).filter(v => v.quantite !== '' && v.quantite != null).length;
  const totalJour = Object.values(edits).reduce((s, v) => s + (Number(v.quantite) || 0), 0);
  // Auteur du dernier relevé de production enregistré (BU/date affichée) : ligne au updated_at le plus récent.
  const lastSaved = grid.filter(r => r.saisi_le && r.saisi_par).sort((a, b) => new Date(b.saisi_le) - new Date(a.saisi_le))[0] || null;
  const saisieExport = grid.map(r => ({ ...r, produit: edits[r.product_id]?.quantite ?? '' }));
  const totalPeriode = suivi.reduce((s, r) => s + Number(r.total_produit || 0), 0);
  const fmtBucket = b => {
    const s = String(b).slice(0, 10);
    if (evoGran === 'mois') { const [y, m] = s.split('-'); return `${m}/${y}`; }
    return s.split('-').slice(1).reverse().join('/');
  };
  const evoData = evo.map(e => ({ x: fmtBucket(e.bucket), valeur: e.valeur }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ margin: '0 0 4px' }}>{t('prodrel.title')}</h1>
          <p className="page-subtitle" style={{ margin: '0 0 8px' }}>{t('prodrel.subtitle')}</p>
        </div>
        <ExportButtons filename={tab === 'saisie' ? `production_${date}` : `production_${period.from}_${period.to}`}
          columns={tab === 'saisie' ? SAISIE_COLS : SUIVI_COLS} rows={tab === 'saisie' ? saisieExport : suivi} />
      </div>
      <Segmented tab={tab} setTab={setTab} />

      {tab === 'saisie' && (
        <>
          <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ minWidth: 180 }}>{t('stockreleve.bu')}
              <select value={buId} onChange={e => { setMsg(null); setBuId(e.target.value); }}>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}</select>
            </label>
            <label className="field">{t('stockreleve.date')}<input type="date" value={date} onChange={e => { setMsg(null); setDate(e.target.value); }} /></label>
            <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'right' }}>
              {t('stockreleve.entered', { n: nbSaisis, total: grid.length })}<br /><strong>{t('prodrel.totalDay', { v: fmt(totalJour) })}</strong>
              {lastSaved && <><br /><span style={{ fontSize: 12, fontWeight: 400 }}>{t('stockreleve.lastBy', { name: lastSaved.saisi_par, date: new Date(lastSaved.saisi_le).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR') })}</span></>}
            </div>
          </div>
          {msg && <div className={`alert ${msg.type === 'error' ? 'alert-danger' : 'alert-success'}`} style={{ marginBottom: 12 }}>{msg.text}</div>}
          {grid.length === 0 && <p className="empty-row">{t('stockreleve.noProduct')}</p>}
          {grid.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('stockreleve.th.product')}</th><th className="num">{t('prodrel.thQty')}</th><th>{t('stockreleve.th.comment')}</th></tr></thead>
                  <tbody>
                    {grid.map(r => (
                      <tr key={r.product_id}>
                        <td><strong>{r.code || ''}</strong>{r.code ? ' — ' : ''}{r.designation}<div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{r.unite || ''}</div></td>
                        <td className="num">
                          <input type="number" min="0" step="0.001" disabled={!canSaisir} value={edits[r.product_id]?.quantite ?? ''} style={{ width: 110, textAlign: 'right' }}
                            onChange={e => setEdits(x => ({ ...x, [r.product_id]: { ...x[r.product_id], quantite: e.target.value } }))} />
                        </td>
                        <td><input disabled={!canSaisir} value={edits[r.product_id]?.commentaire ?? ''} placeholder={t('stockreleve.optional')} style={{ width: 180 }}
                          onChange={e => setEdits(x => ({ ...x, [r.product_id]: { ...x[r.product_id], commentaire: e.target.value } }))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {canSaisir && grid.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? t('common.saving') : t('prodrel.save', { date: d10(date) })}
              </button>
              {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.type === 'error' ? 'var(--color-danger, #b91c1c)' : 'var(--color-success, #15803d)' }}>{msg.text}</span>}
            </div>
          )}
        </>
      )}

      {tab === 'suivi' && (canSuivi ? (
        <>
          <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field">{t('mvt.from')}<input type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} /></label>
            <label className="field">{t('mvt.to')}<input type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} /></label>
            <label className="field" style={{ minWidth: 160 }}>{t('stockreleve.bu')}
              <select value={period.bu} onChange={e => setPeriod(p => ({ ...p, bu: e.target.value }))}>
                <option value="">{t('stockcommon.all')}</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
            <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-muted)' }}>{t('prodrel.totalPeriod', { v: fmt(totalPeriode) })}</div>
          </div>
          {suivi.length === 0 && <p className="empty-row">{t('prodrel.noneInPeriod')}</p>}
          {suivi.length > 0 && (
            <>
              <section className="card" style={{ marginBottom: 16 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>{t('prodrel.byProduct')}</h2>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={suivi.slice(0, 12).map(r => ({ nom: r.code || r.designation, total: Number(r.total_produit) }))} margin={{ top: 6, right: 10, bottom: 6, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="nom" fontSize={11} /><YAxis fontSize={11} tickFormatter={fmt} width={60} />
                      <Tooltip formatter={v => fmt(v)} />
                      <Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 16 }}>{t('cockpit.prod.evo')}</h2>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={evoProduct} onChange={e => setEvoProduct(e.target.value)} style={{ minWidth: 160 }}>
                      <option value="">{t('stockreleve.totalBu')}</option>
                      {suivi.map(r => <option key={r.product_id} value={r.product_id}>{r.code ? r.code + ' — ' : ''}{r.designation}</option>)}
                    </select>
                    <select value={evoGran} onChange={e => setEvoGran(e.target.value)}>
                      <option value="jour">{t('cockpit.period.day')}</option>
                      <option value="semaine">{t('cockpit.period.week')}</option>
                      <option value="mois">{t('cockpit.period.month')}</option>
                    </select>
                  </div>
                </div>
                {evoData.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>{t('prodrel.evoNone')}</p> : (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <LineChart data={evoData} margin={{ top: 6, right: 12, bottom: 6, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="x" fontSize={11} />
                        <YAxis fontSize={11} width={60} tickFormatter={fmt} />
                        <Tooltip formatter={v => fmt(v)} />
                        <Line type="monotone" dataKey="valeur" stroke="var(--color-primary, #2454e0)" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              <div className="card" style={{ padding: 0 }}>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>{t('stockreleve.th.product')}</th><th>{t('stockreleve.th.bu')}</th><th className="num">{t('prodrel.th.totalProduced')}</th><th className="num">{t('prodrel.th.daysEntered')}</th><th>{t('prodrel.th.lastDay')}</th><th>{t('stockreleve.th.by')}</th></tr></thead>
                    <tbody>
                      {suivi.map(r => (
                        <tr key={r.product_id}>
                          <td><strong>{r.code || ''}</strong>{r.code ? ' — ' : ''}{r.designation}</td>
                          <td>{r.bu_nom}</td>
                          <td className="num" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(r.total_produit)} {r.unite || ''}</td>
                          <td className="num">{r.jours_saisis}</td>
                          <td>{d10(r.dernier_jour)}</td>
                          <td style={{ color: 'var(--color-text-muted)' }}>{r.saisi_par || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      ) : <p>{t('prodrel.suiviNotAllowed')}</p>)}
    </div>
  );
}
