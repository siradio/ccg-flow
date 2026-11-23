import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const CAT_5M = ['matiere', 'main_oeuvre', 'methode', 'milieu', 'materiel', 'autre'];
const WF = ['ouverte', 'analyse', 'action', 'verification'];
const ACT_TYPES = ['corrective', 'preventive'];
const ACT_STATUTS = ['a_faire', 'en_cours', 'faite'];
const dstr = v => (v ? String(v).slice(0, 10) : '');

// Fiche de non-conformité : en-tête (risque, action immédiate, statut, vérification, conclusion) +
// analyse des causes 5M + actions correctives/préventives (CAPA) + clôture. Verrouillé si clôturée.
export default function QhseNCDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const canClose = hasSubModuleLevel(user, 'qhse.nc', 'edition');
  const [n, setN] = useState(null);
  const [severities, setSeverities] = useState([]);
  const [hdr, setHdr] = useState({});
  const [causes, setCauses] = useState([]);
  const [actions, setActions] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const apply = d => {
    setN(d);
    setHdr({
      date_detection: dstr(d.date_detection), detecteur: d.detecteur || '', source: d.source || '',
      severity_id: d.severity_id || '', numero_lot: d.numero_lot || '', description: d.description || '',
      risque: d.risque || '', action_immediate: d.action_immediate || '', efficacite: d.efficacite || '',
      conclusion: d.conclusion || '', statut: d.statut || 'ouverte',
    });
    setCauses((d.causes || []).map(c => ({ ...c })));
    setActions((d.actions || []).map(a => ({ ...a, echeance: dstr(a.echeance), date_realisation: dstr(a.date_realisation) })));
  };
  useEffect(() => {
    client.get(`/qhse/nonconformities/${id}`).then(r => apply(r.data)).catch(() => {});
    client.get('/qhse/referentials/nc-severities').then(r => setSeverities(r.data)).catch(() => {});
  }, [id]);

  const locked = n?.statut === 'cloturee';
  const setH = (k, v) => setHdr(p => ({ ...p, [k]: v }));
  const setC = (i, k, v) => setCauses(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const setA = (i, k, v) => setActions(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addCause = () => setCauses(rs => [...rs, { categorie: 'matiere', description: '' }]);
  const addAction = () => setActions(rs => [...rs, { type_action: 'corrective', description: '', responsable: '', echeance: '', statut: 'a_faire', date_realisation: '' }]);
  const flash = m => { setMsg(m); setErr(''); };
  const fail = e => { setErr(e.response?.data?.error || t('rh.saveError')); setMsg(''); };

  const saveHeader = () => client.put(`/qhse/nonconformities/${id}`, hdr).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  const saveCauses = () => client.put(`/qhse/nonconformities/${id}/causes`, { causes }).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  const saveActions = () => client.put(`/qhse/nonconformities/${id}/actions`, { actions }).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  const close = () => client.post(`/qhse/nonconformities/${id}/close`).then(r => { apply(r.data); flash(t('qhse.nc.closed')); }).catch(fail);

  if (!n) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{n.numero} · {n.product_nom || ''}</h1>
      <div style={{ marginBottom: 12 }}><span className="muted">{t('qhse.ncstatut.' + n.statut)}</span></div>
      {err && <div className="alert alert-danger" style={{ maxWidth: 760 }}>{err}</div>}
      {msg && <div className="alert" style={{ maxWidth: 760 }}>{msg}</div>}

      {/* En-tête / détection */}
      <div className="card" style={{ maxWidth: 760, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.nc.secDetection')}</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.nc.date')}<input type="date" value={hdr.date_detection} disabled={locked} onChange={e => setH('date_detection', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.nc.detecteur')}<input value={hdr.detecteur} disabled={locked} onChange={e => setH('detecteur', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.nc.gravite')}
            <select value={hdr.severity_id} disabled={locked} onChange={e => setH('severity_id', e.target.value)}>
              <option value="">—</option>{severities.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
            </select></label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 200px' }}>{t('qhse.nc.source')}<input value={hdr.source} disabled={locked} onChange={e => setH('source', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.ana.lot')}<input value={hdr.numero_lot} disabled={locked} onChange={e => setH('numero_lot', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.ana.statut')}
            <select value={hdr.statut} disabled={locked} onChange={e => setH('statut', e.target.value)}>
              {WF.map(s => <option key={s} value={s}>{t('qhse.ncstatut.' + s)}</option>)}
            </select></label>
        </div>
        <label className="field">{t('qhse.nc.description')}<textarea rows={2} value={hdr.description} disabled={locked} onChange={e => setH('description', e.target.value)} /></label>
        <label className="field">{t('qhse.nc.risque')}<textarea rows={2} value={hdr.risque} disabled={locked} onChange={e => setH('risque', e.target.value)} /></label>
        <label className="field">{t('qhse.nc.actionImmediate')}<textarea rows={2} value={hdr.action_immediate} disabled={locked} onChange={e => setH('action_immediate', e.target.value)} /></label>
        <label className="field">{t('qhse.nc.efficacite')}<textarea rows={2} value={hdr.efficacite} disabled={locked} onChange={e => setH('efficacite', e.target.value)} /></label>
        <label className="field">{t('qhse.nc.conclusion')}<textarea rows={2} value={hdr.conclusion} disabled={locked} onChange={e => setH('conclusion', e.target.value)} /></label>
        {!locked && <div><button className="btn btn-primary" onClick={saveHeader}>{t('qhse.ana.save')}</button></div>}
      </div>

      {/* Analyse des causes — 5M */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.nc.sec5M')}</h3>
        <div className="table-wrap"><table><thead><tr>
          <th>{t('qhse.nc.categorie')}</th><th>{t('qhse.nc.cause')}</th><th></th>
        </tr></thead><tbody>
          {causes.map((c, i) => (
            <tr key={i}>
              <td><select value={c.categorie || ''} disabled={locked} onChange={e => setC(i, 'categorie', e.target.value)}>
                {CAT_5M.map(x => <option key={x} value={x}>{t('qhse.cat.' + x)}</option>)}</select></td>
              <td><input style={{ width: '100%', minWidth: 320 }} value={c.description || ''} disabled={locked} onChange={e => setC(i, 'description', e.target.value)} /></td>
              <td>{!locked && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCauses(rs => rs.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          ))}
          {causes.length === 0 && <tr><td colSpan={3} className="empty-row">{t('qhse.nc.noCause')}</td></tr>}
        </tbody></table></div>
        {!locked && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addCause}>+ {t('qhse.nc.addCause')}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveCauses}>{t('qhse.ana.save')}</button>
        </div>}
      </div>

      {/* Actions correctives / préventives (CAPA) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.nc.secCapa')}</h3>
        <div className="table-wrap"><table><thead><tr>
          <th>{t('qhse.nc.type')}</th><th>{t('qhse.nc.action')}</th><th>{t('qhse.nc.responsable')}</th>
          <th>{t('qhse.nc.echeance')}</th><th>{t('qhse.ana.statut')}</th><th>{t('qhse.nc.realisation')}</th><th></th>
        </tr></thead><tbody>
          {actions.map((a, i) => (
            <tr key={i}>
              <td><select value={a.type_action || ''} disabled={locked} onChange={e => setA(i, 'type_action', e.target.value)}>
                {ACT_TYPES.map(x => <option key={x} value={x}>{t('qhse.acttype.' + x)}</option>)}</select></td>
              <td><input style={{ width: '100%', minWidth: 220 }} value={a.description || ''} disabled={locked} onChange={e => setA(i, 'description', e.target.value)} /></td>
              <td><input style={{ width: 110 }} value={a.responsable || ''} disabled={locked} onChange={e => setA(i, 'responsable', e.target.value)} /></td>
              <td><input type="date" value={a.echeance || ''} disabled={locked} onChange={e => setA(i, 'echeance', e.target.value)} /></td>
              <td><select value={a.statut || 'a_faire'} disabled={locked} onChange={e => setA(i, 'statut', e.target.value)}>
                {ACT_STATUTS.map(x => <option key={x} value={x}>{t('qhse.actstatut.' + x)}</option>)}</select></td>
              <td><input type="date" value={a.date_realisation || ''} disabled={locked} onChange={e => setA(i, 'date_realisation', e.target.value)} /></td>
              <td>{!locked && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActions(rs => rs.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          ))}
          {actions.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.nc.noAction')}</td></tr>}
        </tbody></table></div>
        {!locked && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addAction}>+ {t('qhse.nc.addAction')}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveActions}>{t('qhse.ana.save')}</button>
        </div>}
      </div>

      {!locked && canClose && <button className="btn btn-secondary" onClick={close}>{t('qhse.nc.close')}</button>}
      <p style={{ marginTop: 14 }}><Link to="/qhse/non-conformites">← {t('qhse.ana.backList')}</Link></p>
    </div>
  );
}
