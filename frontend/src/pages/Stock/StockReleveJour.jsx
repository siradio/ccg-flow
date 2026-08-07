import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import StockSectionNav from './StockSectionNav';
import { ExportButtons } from '../../utils/exportData';
import { useI18n } from '../../i18n/I18nContext';

// Refonte Stock — « Relevé du jour » (produits finis). Grille rapide du matin (une ligne par produit,
// une colonne quantité) + suivi Direction comparant le relevé au stock théorique du grand livre.
const today = () => new Date().toISOString().slice(0, 10);
const fmt = n => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const ecartColor = e => (e == null ? 'inherit' : e === 0 ? '#15803d' : e > 0 ? '#1d4ed8' : '#b91c1c');

const SAISIE_COLS = [
  { key: 'code', label: 'Code' }, { key: 'designation', label: 'Produit' },
  { key: 'releve', label: 'Stock du jour', type: 'number' },
];
const SUIVI_COLS = [
  { key: 'code', label: 'Code' }, { key: 'designation', label: 'Produit' }, { key: 'bu_nom', label: 'Business Unit' },
  { key: 'releve', label: 'Dernier relevé', type: 'number' }, { key: 'date_stock', label: 'Date', type: 'date' },
  { key: 'saisi_par', label: 'Par' },
  { key: 'theorique', label: 'Théorique', type: 'number' }, { key: 'ecart', label: 'Écart', type: 'number' },
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

export default function StockReleveJour() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canView = hasSubModuleLevel(user, 'stock.releve_jour');
  const canSaisir = hasSubModuleLevel(user, 'stock.releve_jour', 'ajout');

  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('vue') === 'suivi' ? 'suivi' : 'saisie');
  const [bus, setBus] = useState([]);
  const [buId, setBuId] = useState('');
  const [date, setDate] = useState(today());
  const [grid, setGrid] = useState([]);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState(null); // { type: 'success' | 'error', text }
  const [saving, setSaving] = useState(false);
  const [suiviDate, setSuiviDate] = useState(today());
  const [suiviBu, setSuiviBu] = useState('');
  const [dash, setDash] = useState([]);
  // Évolution : granularité (semaine/mois/perso), produit (vide = total BU), plage perso.
  const [evoGran, setEvoGran] = useState('semaine');
  const [evoProduct, setEvoProduct] = useState('');
  const [evoRange, setEvoRange] = useState({ from: '', to: today() });
  const [evo, setEvo] = useState([]);

  useEffect(() => { if (canView) client.get('/business-units').then(r => { setBus(r.data); if (r.data[0]) setBuId(String(r.data[0].id)); }).catch(() => {}); }, [canView]);

  function loadGrid() {
    if (!buId || !date) return;
    client.get(`/stock-releve/grid?business_unit_id=${buId}&date=${date}`).then(r => {
      setGrid(r.data);
      setEdits(Object.fromEntries(r.data.map(x => [x.product_id, { quantite: x.releve ?? '', commentaire: x.commentaire ?? '' }])));
      // NB : ne pas vider `msg` ici — loadGrid est rappelé juste après un enregistrement réussi,
      // et on veut que la confirmation reste affichée. Le message est réinitialisé au changement de BU/date.
    }).catch(() => {});
  }
  useEffect(() => { if (canView && tab === 'saisie') loadGrid(); /* eslint-disable-next-line */ }, [canView, tab, buId, date]);
  useEffect(() => {
    if (!(canView && tab === 'suivi')) return;
    const qs = `date=${suiviDate}${suiviBu ? `&business_unit_id=${suiviBu}` : ''}`;
    client.get(`/stock-releve/dashboard?${qs}`).then(r => setDash(r.data)).catch(() => {});
  }, [canView, tab, suiviDate, suiviBu]);

  function evoParams() {
    const t = today();
    if (evoGran === 'mois') { const d = new Date(); d.setMonth(d.getMonth() - 11); return { granularity: 'mois', from: d.toISOString().slice(0, 10), to: t }; }
    if (evoGran === 'personnalise') { return { granularity: 'jour', from: evoRange.from, to: evoRange.to || t }; }
    const d = new Date(); d.setDate(d.getDate() - 83); return { granularity: 'semaine', from: d.toISOString().slice(0, 10), to: t };
  }
  useEffect(() => {
    if (!(canView && tab === 'suivi')) return;
    const p = evoParams();
    if (!p.from) { setEvo([]); return; }
    const qs = `granularity=${p.granularity}&date_from=${p.from}&date_to=${p.to}${suiviBu ? `&business_unit_id=${suiviBu}` : ''}${evoProduct ? `&product_id=${evoProduct}` : ''}`;
    client.get(`/stock-releve/evolution?${qs}`).then(r => setEvo(r.data)).catch(() => setEvo([]));
    // eslint-disable-next-line
  }, [canView, tab, evoGran, evoProduct, suiviBu, evoRange]);

  const saisieExport = useMemo(() => grid.map(r => {
    const q = edits[r.product_id]?.quantite;
    return { ...r, releve: q === '' || q == null ? '' : Number(q), ecart: q === '' || q == null ? '' : Number(q) - Number(r.theorique) };
  }), [grid, edits]);

  // Auteur du dernier relevé enregistré pour la BU/date affichée : ligne du grid au updated_at le
  // plus récent (les lignes sans relevé n'ont ni saisi_par ni saisi_le).
  const lastSaved = useMemo(() => grid
    .filter(r => r.saisi_le && r.saisi_par)
    .sort((a, b) => new Date(b.saisi_le) - new Date(a.saisi_le))[0] || null, [grid]);

  const fmtBucket = b => {
    const s = String(b).slice(0, 10);
    if (evoGran === 'mois') { const [y, m] = s.split('-'); return `${m}/${y}`; }
    return s.split('-').slice(1).reverse().join('/');
  };
  const evoData = evo.map(e => ({ x: fmtBucket(e.bucket), valeur: e.valeur }));

  if (!canView) return <div><StockSectionNav /><p>{t('stockreleve.notAllowed')}</p></div>;

  async function save() {
    if (saving) return; // garde-fou anti double-clic
    const lines = Object.entries(edits).filter(([, v]) => v.quantite !== '' && v.quantite != null)
      .map(([product_id, v]) => ({ product_id: Number(product_id), quantite: Number(v.quantite), commentaire: v.commentaire }));
    setSaving(true); setMsg(null);
    try {
      const { data } = await client.put('/stock-releve/grid', { business_unit_id: Number(buId), date, lines });
      setMsg({ type: 'success', text: t('stockreleve.saved', { n: data.saved }) });
      loadGrid();
    } catch (e) {
      setMsg({ type: 'error', text: t('stockreleve.saveError', { err: e.response?.data?.error || t('stockreleve.serverError') }) });
    } finally {
      setSaving(false);
    }
  }

  const nbSaisis = Object.values(edits).filter(v => v.quantite !== '' && v.quantite != null).length;

  return (
    <div>
      <StockSectionNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ margin: '0 0 4px' }}>{t('stockreleve.title')}</h1>
          <p className="page-subtitle" style={{ margin: '0 0 8px' }}>{t('stockreleve.subtitle')}</p>
        </div>
        <ExportButtons filename={tab === 'saisie' ? `releve_${date}` : `suivi_releve_${suiviDate}`}
          columns={tab === 'saisie' ? SAISIE_COLS : SUIVI_COLS} rows={tab === 'saisie' ? saisieExport : dash} />
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
              {t('stockreleve.entered', { n: nbSaisis, total: grid.length })}
              {lastSaved && <><br /><span style={{ fontSize: 12 }}>{t('stockreleve.lastBy', { name: lastSaved.saisi_par, date: new Date(lastSaved.saisi_le).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR') })}</span></>}
            </div>
          </div>
          {msg && <div className={`alert ${msg.type === 'error' ? 'alert-danger' : 'alert-success'}`} style={{ marginBottom: 12 }}>{msg.text}</div>}
          {grid.length === 0 && <p className="empty-row">{t('stockreleve.noProduct')}</p>}
          {grid.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  {/* Théorique/Écart masqués pour l'instant (écran calé sur la saisie Production). */}
                  <thead><tr><th>{t('stockreleve.th.product')}</th><th className="num">{t('stockreleve.th.stock')}</th><th>{t('stockreleve.th.comment')}</th></tr></thead>
                  <tbody>
                    {grid.map(r => {
                      const q = edits[r.product_id]?.quantite;
                      return (
                        <tr key={r.product_id}>
                          <td><strong>{r.code || ''}</strong>{r.code ? ' — ' : ''}{r.designation}<div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{r.unite || ''}</div></td>
                          <td className="num">
                            <input type="number" step="0.001" disabled={!canSaisir} value={q ?? ''} style={{ width: 100, textAlign: 'right' }}
                              onChange={e => setEdits(x => ({ ...x, [r.product_id]: { ...x[r.product_id], quantite: e.target.value } }))} />
                          </td>
                          <td><input disabled={!canSaisir} value={edits[r.product_id]?.commentaire ?? ''} placeholder={t('stockreleve.optional')} style={{ width: 160 }}
                            onChange={e => setEdits(x => ({ ...x, [r.product_id]: { ...x[r.product_id], commentaire: e.target.value } }))} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {canSaisir && grid.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? t('common.saving') : t('stockreleve.save', { date: date.split('-').reverse().join('/') })}
              </button>
              {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.type === 'error' ? 'var(--color-danger, #b91c1c)' : 'var(--color-success, #15803d)' }}>{msg.text}</span>}
            </div>
          )}
        </>
      )}

      {tab === 'suivi' && (
        <>
          <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field">{t('stockreleve.situationAt')}<input type="date" value={suiviDate} onChange={e => setSuiviDate(e.target.value)} /></label>
            <label className="field" style={{ minWidth: 170 }}>{t('stockreleve.bu')}
              <select value={suiviBu} onChange={e => setSuiviBu(e.target.value)}>
                <option value="">{t('stockreleve.all')}</option>{bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </label>
            <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-muted)' }}>{t('stockreleve.lastKnownHint')}</div>
          </div>
          <section className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{t('stockreleve.evoTitle')}</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={evoProduct} onChange={e => setEvoProduct(e.target.value)} style={{ minWidth: 160 }}>
                  <option value="">{t('stockreleve.totalBu')}</option>
                  {dash.map(r => <option key={r.product_id} value={r.product_id}>{r.code ? r.code + ' — ' : ''}{r.designation}</option>)}
                </select>
                <select value={evoGran} onChange={e => setEvoGran(e.target.value)}>
                  <option value="semaine">{t('stockreleve.evoWeek')}</option>
                  <option value="mois">{t('stockreleve.evoMonth')}</option>
                  <option value="personnalise">{t('stockreleve.evoCustom')}</option>
                </select>
                {evoGran === 'personnalise' && (
                  <>
                    <input type="date" value={evoRange.from} onChange={e => setEvoRange(r => ({ ...r, from: e.target.value }))} />
                    <input type="date" value={evoRange.to} onChange={e => setEvoRange(r => ({ ...r, to: e.target.value }))} />
                  </>
                )}
              </div>
            </div>
            {evoData.length === 0 ? <p className="empty-row" style={{ margin: 0 }}>{t('stockreleve.evoNone')}</p> : (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={evoData} margin={{ top: 6, right: 12, bottom: 6, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="x" fontSize={11} />
                    <YAxis fontSize={11} width={64} tickFormatter={fmt} />
                    <Tooltip formatter={v => fmt(v)} />
                    <Line type="monotone" dataKey="valeur" stroke="var(--color-primary, #2454e0)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {dash.length === 0 && <p className="empty-row">{t('stockreleve.noReading')}</p>}
          {dash.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('stockreleve.th.product')}</th><th>{t('stockreleve.th.bu')}</th><th className="num">{t('stockreleve.th.lastReleve')}</th><th>{t('stockreleve.th.date')}</th><th>{t('stockreleve.th.by')}</th><th className="num">{t('stockreleve.th.theo')}</th><th className="num">{t('stockreleve.th.ecart')}</th></tr></thead>
                  <tbody>
                    {dash.map(r => (
                      <tr key={r.product_id}>
                        <td><strong>{r.code || ''}</strong>{r.code ? ' — ' : ''}{r.designation}</td>
                        <td>{r.bu_nom}</td>
                        <td className="num" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(r.releve)}</td>
                        <td>{r.date_stock ? String(r.date_stock).slice(0, 10).split('-').reverse().join('/') : '—'}</td>
                        <td style={{ color: 'var(--color-text-muted)' }}>{r.saisi_par || '—'}</td>
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
