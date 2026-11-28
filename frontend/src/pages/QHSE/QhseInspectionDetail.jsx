import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const dstr = v => (v ? String(v).slice(0, 10) : '');

export default function QhseInspectionDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const canClose = hasSubModuleLevel(user, 'qhse.hygiene', 'edition');
  const [i, setI] = useState(null);
  const [vals, setVals] = useState({});   // criteria_id -> { valeur_bool, valeur_num, commentaire }
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const apply = d => {
    setI(d);
    const m = {};
    for (const r of d.results || []) m[r.criteria_id] = { valeur_bool: r.valeur_bool, valeur_num: r.valeur_num ?? '', commentaire: r.commentaire || '' };
    setVals(m);
  };
  useEffect(() => { client.get(`/qhse/inspections/${id}`).then(r => apply(r.data)).catch(() => {}); }, [id]);

  const locked = i?.statut === 'cloture';
  const setV = (cid, k, v) => setVals(p => ({ ...p, [cid]: { ...(p[cid] || {}), [k]: v } }));
  const flash = m => { setMsg(m); setErr(''); };
  const fail = e => { setErr(e.response?.data?.error || t('rh.saveError')); setMsg(''); };

  const save = () => {
    const results = (i.criteria || []).map(c => ({
      criteria_id: c.id,
      valeur_bool: (vals[c.id] && vals[c.id].valeur_bool != null) ? vals[c.id].valeur_bool : null,
      valeur_num: (vals[c.id] && vals[c.id].valeur_num !== '' && vals[c.id].valeur_num != null) ? vals[c.id].valeur_num : null,
      commentaire: vals[c.id] && vals[c.id].commentaire,
    }));
    client.put(`/qhse/inspections/${id}/results`, { results }).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  };
  const close = () => client.post(`/qhse/inspections/${id}/close`).then(r => { apply(r.data); flash(t('qhse.hyg.closed')); }).catch(fail);

  if (!i) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  const confById = Object.fromEntries((i.results || []).map(r => [r.criteria_id, r.conformite]));
  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{i.type_libelle} · {dstr(i.date_inspection)}</h1>
      <div style={{ marginBottom: 12 }}>
        <span className="muted">{t('qhse.inspstatut.' + i.statut)}</span>
        {i.conformite && <span className="muted"> · {t('qhse.ana.conformite')} : {t('qhse.conf.' + i.conformite)}</span>}
        {i.zone ? <span className="muted"> · {i.zone}</span> : null}
      </div>
      {err && <div className="alert alert-danger" style={{ maxWidth: 760 }}>{err}</div>}
      {msg && <div className="alert" style={{ maxWidth: 760 }}>{msg}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.hyg.secCheck')}</h3>
        {(i.criteria || []).length === 0 && <p className="muted">{t('qhse.hyg.noCriteria')}</p>}
        {(i.criteria || []).length > 0 && (
          <div className="table-wrap"><table><thead><tr>
            <th>{t('qhse.hyg.critere')}</th><th>{t('qhse.hyg.valeur')}</th><th>{t('qhse.ana.conformite')}</th><th>{t('qhse.hyg.comment')}</th>
          </tr></thead><tbody>
            {i.criteria.map(c => (
              <tr key={c.id}>
                <td>{c.libelle}{c.unite ? ` (${c.unite})` : ''}</td>
                <td>
                  {c.type_critere === 'booleen'
                    ? <select value={vals[c.id] && vals[c.id].valeur_bool === true ? 'oui' : vals[c.id] && vals[c.id].valeur_bool === false ? 'non' : ''} disabled={locked}
                        onChange={e => setV(c.id, 'valeur_bool', e.target.value === 'oui' ? true : e.target.value === 'non' ? false : null)}>
                        <option value="">—</option><option value="oui">{t('qhse.hyg.oui')}</option><option value="non">{t('qhse.hyg.non')}</option>
                      </select>
                    : <input type="number" style={{ width: 120 }} value={vals[c.id] ? vals[c.id].valeur_num ?? '' : ''} disabled={locked}
                        onChange={e => setV(c.id, 'valeur_num', e.target.value)} />}
                </td>
                <td>{confById[c.id] ? t('qhse.conf.' + confById[c.id]) : '—'}</td>
                <td><input style={{ width: '100%', minWidth: 160 }} value={vals[c.id] ? vals[c.id].commentaire || '' : ''} disabled={locked} onChange={e => setV(c.id, 'commentaire', e.target.value)} /></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        {!locked && i.criteria && i.criteria.length > 0 && <div style={{ marginTop: 10 }}><button className="btn btn-primary" onClick={save}>{t('qhse.ana.save')}</button></div>}
      </div>

      {!locked && canClose && <button className="btn btn-secondary" onClick={close}>{t('qhse.hyg.close')}</button>}
      <p style={{ marginTop: 14 }}><Link to="/qhse/inspections">← {t('qhse.ana.backList')}</Link></p>
    </div>
  );
}
