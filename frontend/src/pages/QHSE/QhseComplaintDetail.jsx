import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const WF = ['ouverte', 'investigation', 'reponse'];
const ACT_TYPES = ['corrective', 'preventive'];
const ACT_STATUTS = ['a_faire', 'en_cours', 'faite'];
const dstr = v => (v ? String(v).slice(0, 10) : '');

// Fiche réclamation client : en-tête (investigation, réponse, statut) + actions de traitement + clôture.
export default function QhseComplaintDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const canClose = hasSubModuleLevel(user, 'qhse.complaints', 'edition');
  const [c, setC] = useState(null);
  const [severities, setSeverities] = useState([]);
  const [hdr, setHdr] = useState({});
  const [actions, setActions] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const apply = d => {
    setC(d);
    setHdr({
      date_reclamation: dstr(d.date_reclamation), client: d.client || '', canal: d.canal || '',
      type_reclamation: d.type_reclamation || '', severity_id: d.severity_id || '', numero_lot: d.numero_lot || '',
      quantite_concernee: d.quantite_concernee || '', description: d.description || '', investigation: d.investigation || '',
      reponse_client: d.reponse_client || '', statut: d.statut || 'ouverte',
    });
    setActions((d.actions || []).map(a => ({ ...a, echeance: dstr(a.echeance), date_realisation: dstr(a.date_realisation) })));
  };
  useEffect(() => {
    client.get(`/qhse/complaints/${id}`).then(r => apply(r.data)).catch(() => {});
    client.get('/qhse/referentials/nc-severities').then(r => setSeverities(r.data)).catch(() => {});
  }, [id]);

  const locked = c?.statut === 'cloturee';
  const setH = (k, v) => setHdr(p => ({ ...p, [k]: v }));
  const setA = (i, k, v) => setActions(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addAction = () => setActions(rs => [...rs, { type_action: 'corrective', description: '', responsable: '', echeance: '', statut: 'a_faire', date_realisation: '' }]);
  const flash = m => { setMsg(m); setErr(''); };
  const fail = e => { setErr(e.response?.data?.error || t('rh.saveError')); setMsg(''); };

  const saveHeader = () => client.put(`/qhse/complaints/${id}`, hdr).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  const saveActions = () => client.put(`/qhse/complaints/${id}/actions`, { actions }).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  const close = () => client.post(`/qhse/complaints/${id}/close`).then(r => { apply(r.data); flash(t('qhse.cmp.closed')); }).catch(fail);

  if (!c) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{c.numero} · {c.client || ''}</h1>
      <div style={{ marginBottom: 12 }}><span className="muted">{t('qhse.cmpstatut.' + c.statut)}</span>{c.nc_numero ? <span className="muted"> · NC {c.nc_numero}</span> : null}</div>
      {err && <div className="alert alert-danger" style={{ maxWidth: 760 }}>{err}</div>}
      {msg && <div className="alert" style={{ maxWidth: 760 }}>{msg}</div>}

      <div className="card" style={{ maxWidth: 760, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.cmp.secEnreg')}</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.cmp.date')}<input type="date" value={hdr.date_reclamation} disabled={locked} onChange={e => setH('date_reclamation', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.cmp.client')}<input value={hdr.client} disabled={locked} onChange={e => setH('client', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.cmp.canal')}<input value={hdr.canal} disabled={locked} onChange={e => setH('canal', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.cmp.type')}<input value={hdr.type_reclamation} disabled={locked} onChange={e => setH('type_reclamation', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.nc.gravite')}
            <select value={hdr.severity_id} disabled={locked} onChange={e => setH('severity_id', e.target.value)}>
              <option value="">—</option>{severities.map(x => <option key={x.id} value={x.id}>{x.libelle}</option>)}
            </select></label>
          <label className="field" style={{ flex: '1 1 140px' }}>{t('qhse.ana.lot')}<input value={hdr.numero_lot} disabled={locked} onChange={e => setH('numero_lot', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.ana.statut')}
            <select value={hdr.statut} disabled={locked} onChange={e => setH('statut', e.target.value)}>
              {WF.map(s => <option key={s} value={s}>{t('qhse.cmpstatut.' + s)}</option>)}
            </select></label>
        </div>
        <label className="field">{t('qhse.cmp.quantite')}<input value={hdr.quantite_concernee} disabled={locked} onChange={e => setH('quantite_concernee', e.target.value)} /></label>
        <label className="field">{t('qhse.cmp.description')}<textarea rows={2} value={hdr.description} disabled={locked} onChange={e => setH('description', e.target.value)} /></label>
        <label className="field">{t('qhse.cmp.investigation')}<textarea rows={3} value={hdr.investigation} disabled={locked} onChange={e => setH('investigation', e.target.value)} /></label>
        <label className="field">{t('qhse.cmp.reponse')}<textarea rows={3} value={hdr.reponse_client} disabled={locked} onChange={e => setH('reponse_client', e.target.value)} /></label>
        {!locked && <div><button className="btn btn-primary" onClick={saveHeader}>{t('qhse.ana.save')}</button></div>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.cmp.secActions')}</h3>
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

      {!locked && canClose && <button className="btn btn-secondary" onClick={close}>{t('qhse.cmp.close')}</button>}
      <p style={{ marginTop: 14 }}><Link to="/qhse/reclamations">← {t('qhse.ana.backList')}</Link></p>
    </div>
  );
}
