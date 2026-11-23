import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { ConfBadge } from './qhseConformite';

const b2s = v => (v === true ? 'true' : v === false ? 'false' : '');
const BOOL = [['', '—'], ['true', 'OK'], ['false', 'NOK']];

// Détail d'un contrôle d'expédition : grille des points de contrôle (un par critère). La valeur
// dépend du type du critère. Conformité recalculée côté serveur. Clôture (verrou) = niveau édition.
export default function QhseShipmentDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const canClose = hasSubModuleLevel(user, 'qhse.expeditions', 'edition');
  const [c, setC] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const apply = d => { setC(d); setRows((d.checks || []).map(r => ({ ...r, valeur_bool: b2s(r.valeur_bool) }))); };
  useEffect(() => {
    client.get(`/qhse/shipments/${id}`).then(r => apply(r.data)).catch(() => {});
    client.get('/qhse/referentials/shipment-criteria').then(r => setCriteria(r.data)).catch(() => {});
  }, [id]);

  const locked = c?.statut === 'cloture';
  const critById = cid => criteria.find(x => x.id === Number(cid));
  const setRow = (i, k, v) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addRow = () => setRows(rs => [...rs, { criteria_id: criteria[0]?.id || '', valeur_num: '', valeur_bool: '', observation: '' }]);
  const seedFromCriteria = () => setRows(criteria.filter(x => x.actif !== false).map(x => ({ criteria_id: x.id, valeur_num: '', valeur_bool: '', observation: '' })));
  const delRow = i => setRows(rs => rs.filter((_, j) => j !== i));

  async function save() {
    setMsg(''); setErr('');
    try {
      const payload = { checks: rows.map(r => ({ criteria_id: r.criteria_id, valeur_num: r.valeur_num, valeur_bool: r.valeur_bool, observation: r.observation })) };
      const r = await client.put(`/qhse/shipments/${id}/checks`, payload); apply(r.data); setMsg(t('qhse.ana.saved'));
    } catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); }
  }
  async function close() {
    setMsg(''); setErr('');
    try { const r = await client.post(`/qhse/shipments/${id}/close`); apply(r.data); setMsg(t('qhse.exp.closed')); }
    catch (e) { setErr(e.response?.data?.error || t('rh.saveError')); }
  }

  if (!c) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{c.numero} · {c.destination || ''}</h1>
      <div className="card" style={{ maxWidth: 680, marginBottom: 14 }}>
        <div className="kv"><b>{t('qhse.prod.date')}</b><span>{c.date_controle || '—'}</span></div>
        <div className="kv"><b>{t('qhse.exp.destination')}</b><span>{c.destination || '—'}</span></div>
        <div className="kv"><b>{t('qhse.exp.transporteur')}</b><span>{c.transporteur || '—'}{c.vehicule ? ` · ${c.vehicule}` : ''}</span></div>
        <div className="kv"><b>{t('qhse.ana.product')}</b><span>{c.product_nom || '—'}{c.numero_lot ? ` · ${c.numero_lot}` : ''}</span></div>
        <div className="kv"><b>{t('qhse.ana.verdict')}</b><span><ConfBadge value={c.conformite} t={t} /> <span className="muted">· {t('qhse.status.' + c.statut)}</span></span></div>
      </div>

      {err && <div className="alert alert-danger" style={{ maxWidth: 680 }}>{err}</div>}
      {rows.length === 0 && !locked && criteria.length > 0 &&
        <button className="btn btn-secondary btn-sm" style={{ marginBottom: 10 }} onClick={seedFromCriteria}>{t('qhse.exp.seed')}</button>}
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('qhse.prod.critere')}</th><th>{t('qhse.ana.value')}</th><th>{t('qhse.ana.conf')}</th><th>{t('qhse.ana.obs')}</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const crit = critById(r.criteria_id);
              const isNum = crit?.type_critere === 'numerique';
              return (
                <tr key={i}>
                  <td>
                    <select value={r.criteria_id || ''} disabled={locked} onChange={e => setRow(i, 'criteria_id', e.target.value)}>
                      <option value="">—</option>{criteria.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
                    </select>
                  </td>
                  <td>
                    {isNum
                      ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          <input type="number" step="any" style={{ width: 90 }} value={r.valeur_num ?? ''} disabled={locked} onChange={e => setRow(i, 'valeur_num', e.target.value)} />
                          {crit?.unite && <span className="muted">{crit.unite}</span>}
                        </span>
                      : <select value={r.valeur_bool || ''} disabled={locked} onChange={e => setRow(i, 'valeur_bool', e.target.value)}>
                          {BOOL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>}
                  </td>
                  <td><ConfBadge value={r.conforme} t={t} /></td>
                  <td><input value={r.observation ?? ''} disabled={locked} onChange={e => setRow(i, 'observation', e.target.value)} /></td>
                  <td>{!locked && <button type="button" className="btn btn-secondary btn-sm" onClick={() => delRow(i)}>✕</button>}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="empty-row">{t('qhse.exp.noCheck')}</td></tr>}
          </tbody>
        </table>
      </div>
      {!locked && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={addRow}>+ {t('qhse.exp.addCheck')}</button>}

      {msg && <div className="alert" style={{ marginTop: 10, maxWidth: 680 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        {!locked && <button className="btn btn-primary" onClick={save}>{t('qhse.ana.save')}</button>}
        {!locked && canClose && <button className="btn btn-secondary" onClick={close}>{t('qhse.prod.close')}</button>}
      </div>
      <p style={{ marginTop: 14 }}><Link to="/qhse/expeditions">← {t('qhse.prod.backList')}</Link></p>
    </div>
  );
}
