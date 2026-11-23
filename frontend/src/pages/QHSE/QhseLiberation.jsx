import { useEffect, useState } from 'react';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const DECISIONS = ['libere', 'bloque', 'rebut', 'derogation'];
const DEC_COLORS = {
  libere: ['var(--status-green-fg, #15803d)', 'var(--status-green-bg, #e4f4ea)'],
  bloque: ['var(--status-red-fg, #b4232e)', 'var(--status-red-bg, #fbe6e7)'],
  rebut: ['var(--status-red-fg, #b4232e)', 'var(--status-red-bg, #fbe6e7)'],
  derogation: ['var(--status-amber-fg, #b5760a)', 'var(--status-amber-bg, #fbeecf)'],
};

function StatutBadge({ value, t }) {
  if (!value) return <span className="muted">{t('qhse.dec.aucun')}</span>;
  const [fg, bg] = DEC_COLORS[value] || ['var(--color-text-muted)', 'var(--color-hover)'];
  const label = t('qhse.dec.' + value);
  return <span style={{ background: bg, color: fg, padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{label.startsWith('qhse.') ? value : label}</span>;
}

// Libération des lots : recherche d'un lot (Stock), rappel de son statut qualité actuel + historique
// des décisions, et enregistrement d'une nouvelle décision (qui met à jour stock_lots.statut_qualite).
export default function QhseLiberation() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canDecide = hasSubModuleLevel(user, 'qhse.liberation', 'edition');
  const [q, setQ] = useState('');
  const [lots, setLots] = useState([]);
  const [lot, setLot] = useState(null);
  const [recent, setRecent] = useState([]);
  const [dec, setDec] = useState({ decision: 'libere', motif: '', decideur: '', date_decision: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadRecent = () => client.get('/qhse/liberation').then(r => setRecent(r.data)).catch(() => {});
  useEffect(() => { loadRecent(); }, []);

  async function search(e) {
    e?.preventDefault();
    const r = await client.get('/qhse/liberation/lots', { params: { q } });
    setLots(r.data);
  }
  async function openLot(id) {
    setMsg(''); setErr('');
    const r = await client.get(`/qhse/liberation/lots/${id}`);
    setLot(r.data);
  }
  const setD = (k, v) => setDec(p => ({ ...p, [k]: v }));

  async function decide() {
    setMsg(''); setErr('');
    try {
      await client.post('/qhse/liberation', { ...dec, stock_lot_id: lot.id });
      setMsg(t('qhse.lib.recorded')); setDec({ decision: 'libere', motif: '', decideur: '', date_decision: '' });
      await openLot(lot.id); loadRecent();
    } catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); }
  }

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.lib.title')}</h1>

      <form onSubmit={search} className="form-inline" style={{ gap: 8, marginBottom: 12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('qhse.lib.searchHint')} style={{ minWidth: 260 }} />
        <button className="btn btn-secondary btn-sm" type="submit">{t('qhse.lib.search')}</button>
      </form>

      {lots.length > 0 && !lot && (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table><thead><tr><th>{t('qhse.ana.lot')}</th><th>{t('qhse.ana.product')}</th><th>{t('qhse.lib.statutQualite')}</th><th>{t('qhse.lib.peremption')}</th><th></th></tr></thead>
            <tbody>{lots.map(l => (
              <tr key={l.id}>
                <td>{l.numero_lot}</td><td>{l.product_nom}{l.bu_nom ? ` · ${l.bu_nom}` : ''}</td>
                <td><StatutBadge value={l.statut_qualite} t={t} /></td>
                <td>{l.date_peremption || '—'}</td>
                <td><button className="btn btn-secondary btn-sm" onClick={() => openLot(l.id)}>{t('qhse.ana.open')}</button></td>
              </tr>
            ))}</tbody></table>
        </div>
      )}

      {lot && (
        <div className="card" style={{ maxWidth: 760, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>{lot.numero_lot} · {lot.product_nom}</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setLot(null)}>← {t('qhse.lib.backSearch')}</button>
          </div>
          <div className="kv"><b>{t('qhse.lib.statutQualite')}</b><span><StatutBadge value={lot.statut_qualite} t={t} /></span></div>
          <div className="kv"><b>{t('qhse.lib.peremption')}</b><span>{lot.date_peremption || '—'}</span></div>

          {err && <div className="alert alert-danger">{err}</div>}
          {msg && <div className="alert">{msg}</div>}

          {canDecide ? (
            <>
              <h4 style={{ margin: '12px 0 8px' }}>{t('qhse.lib.newDecision')}</h4>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.lib.decision')}
                  <select value={dec.decision} onChange={e => setD('decision', e.target.value)}>
                    {DECISIONS.map(d => <option key={d} value={d}>{t('qhse.dec.' + d)}</option>)}
                  </select></label>
                <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.lib.decideur')}<input value={dec.decideur} onChange={e => setD('decideur', e.target.value)} /></label>
                <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.nc.date')}<input type="date" value={dec.date_decision} onChange={e => setD('date_decision', e.target.value)} /></label>
              </div>
              <label className="field">{t('qhse.lib.motif')}<textarea rows={2} value={dec.motif} onChange={e => setD('motif', e.target.value)} /></label>
              <div><button className="btn btn-primary" onClick={decide}>{t('qhse.lib.record')}</button></div>
            </>
          ) : <p className="muted" style={{ marginTop: 12 }}>{t('qhse.lib.noRight')}</p>}

          <h4 style={{ margin: '16px 0 8px' }}>{t('qhse.lib.history')}</h4>
          <div className="table-wrap"><table><thead><tr>
            <th>{t('qhse.nc.date')}</th><th>{t('qhse.lib.decision')}</th><th>{t('qhse.lib.decideur')}</th><th>{t('qhse.lib.motif')}</th>
          </tr></thead><tbody>
            {(lot.history || []).map(h => (
              <tr key={h.id}>
                <td>{h.date_decision || (h.created_at ? String(h.created_at).slice(0, 10) : '—')}</td>
                <td><StatutBadge value={h.decision} t={t} /></td>
                <td>{h.decideur || (h.by_prenom ? `${h.by_prenom} ${h.by_nom}` : '—')}</td>
                <td>{h.motif || '—'}</td>
              </tr>
            ))}
            {(lot.history || []).length === 0 && <tr><td colSpan={4} className="empty-row">{t('qhse.lib.noHistory')}</td></tr>}
          </tbody></table></div>
        </div>
      )}

      <h3>{t('qhse.lib.recent')}</h3>
      <div className="table-wrap">
        <table><thead><tr>
          <th>{t('qhse.nc.date')}</th><th>{t('qhse.ana.lot')}</th><th>{t('qhse.ana.product')}</th><th>{t('qhse.lib.decision')}</th><th>{t('qhse.lib.decideur')}</th>
        </tr></thead><tbody>
          {recent.map(r => (
            <tr key={r.id}>
              <td>{r.date_decision || (r.created_at ? String(r.created_at).slice(0, 10) : '—')}</td>
              <td>{r.numero_lot || '—'}</td><td>{r.product_nom || '—'}</td>
              <td><StatutBadge value={r.decision} t={t} /></td>
              <td>{r.decideur || '—'}</td>
            </tr>
          ))}
          {recent.length === 0 && <tr><td colSpan={5} className="empty-row">{t('qhse.lib.noRecent')}</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
