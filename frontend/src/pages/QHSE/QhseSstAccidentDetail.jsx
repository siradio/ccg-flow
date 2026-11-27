import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const TYPES = ['accident_arret', 'accident_sans_arret', 'presque_accident', 'situation_dangereuse'];
const WF = ['declare', 'enquete'];
const ACT_STATUTS = ['a_faire', 'en_cours', 'faite'];
const dstr = v => (v ? String(v).slice(0, 10) : '');

export default function QhseSstAccidentDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const canClose = hasSubModuleLevel(user, 'qhse.sst_accidents', 'edition');
  const [a, setA] = useState(null);
  const [bus, setBus] = useState([]);
  const [hdr, setHdr] = useState({});
  const [actions, setActions] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const apply = d => {
    setA(d);
    setHdr({
      date_evenement: dstr(d.date_evenement), type_evenement: d.type_evenement || 'presque_accident',
      business_unit_id: d.business_unit_id || '', unite_travail: d.unite_travail || '', lieu: d.lieu || '',
      description: d.description || '', jours_perdus: d.jours_perdus ?? '', enquete: d.enquete || '',
      causes: d.causes || '', statut: d.statut || 'declare',
    });
    setActions((d.actions || []).map(x => ({ ...x, echeance: dstr(x.echeance), date_realisation: dstr(x.date_realisation) })));
  };
  useEffect(() => {
    client.get(`/qhse/sst/accidents/${id}`).then(r => apply(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, [id]);

  const locked = a?.statut === 'cloture';
  const setH = (k, v) => setHdr(p => ({ ...p, [k]: v }));
  const setAc = (i, k, v) => setActions(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addAction = () => setActions(rs => [...rs, { type_action: '', description: '', responsable: '', echeance: '', statut: 'a_faire', date_realisation: '' }]);
  const flash = m => { setMsg(m); setErr(''); };
  const fail = e => { setErr(e.response?.data?.error || t('rh.saveError')); setMsg(''); };

  const saveHeader = () => client.put(`/qhse/sst/accidents/${id}`, hdr).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  const saveActions = () => client.put(`/qhse/sst/accidents/${id}/actions`, { actions }).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  const close = () => client.post(`/qhse/sst/accidents/${id}/close`).then(r => { apply(r.data); flash(t('qhse.ssta.closed')); }).catch(fail);

  if (!a) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{a.numero} · {t('qhse.ssttype.' + a.type_evenement)}</h1>
      <div style={{ marginBottom: 12 }}><span className="muted">{t('qhse.sstastatut.' + a.statut)}</span></div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t('qhse.ssta.confidHint')}</p>
      {err && <div className="alert alert-danger" style={{ maxWidth: 760 }}>{err}</div>}
      {msg && <div className="alert" style={{ maxWidth: 760 }}>{msg}</div>}

      <div className="card" style={{ maxWidth: 760, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.ssta.secInfo')}</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.ssta.date')}<input type="date" value={hdr.date_evenement} disabled={locked} onChange={e => setH('date_evenement', e.target.value)} /></label>
          <label className="field" style={{ flex: '2 1 220px' }}>{t('qhse.ssta.type')}<select value={hdr.type_evenement} disabled={locked} onChange={e => setH('type_evenement', e.target.value)}>{TYPES.map(x => <option key={x} value={x}>{t('qhse.ssttype.' + x)}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 120px' }}>{t('qhse.ssta.jours')}<input type="number" min="0" value={hdr.jours_perdus} disabled={locked} onChange={e => setH('jours_perdus', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 140px' }}>BU<select value={hdr.business_unit_id} disabled={locked} onChange={e => setH('business_unit_id', e.target.value)}><option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.sstr.unite')}<input value={hdr.unite_travail} disabled={locked} onChange={e => setH('unite_travail', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.ssta.lieu')}<input value={hdr.lieu} disabled={locked} onChange={e => setH('lieu', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.ana.statut')}<select value={hdr.statut} disabled={locked} onChange={e => setH('statut', e.target.value)}>{WF.map(s => <option key={s} value={s}>{t('qhse.sstastatut.' + s)}</option>)}</select></label>
        </div>
        <label className="field">{t('qhse.ssta.description')}<textarea rows={2} value={hdr.description} disabled={locked} onChange={e => setH('description', e.target.value)} /></label>
        <label className="field">{t('qhse.ssta.enquete')}<textarea rows={2} value={hdr.enquete} disabled={locked} onChange={e => setH('enquete', e.target.value)} /></label>
        <label className="field">{t('qhse.ssta.causes')}<textarea rows={2} value={hdr.causes} disabled={locked} onChange={e => setH('causes', e.target.value)} /></label>
        {!locked && <div><button className="btn btn-primary" onClick={saveHeader}>{t('qhse.ana.save')}</button></div>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.ssta.secActions')}</h3>
        <div className="table-wrap"><table><thead><tr>
          <th>{t('qhse.ssta.actType')}</th><th>{t('qhse.ssta.actDesc')}</th><th>{t('qhse.nc.responsable')}</th>
          <th>{t('qhse.nc.echeance')}</th><th>{t('qhse.ana.statut')}</th><th>{t('qhse.ssta.actDone')}</th><th></th>
        </tr></thead><tbody>
          {actions.map((x, i) => (
            <tr key={i}>
              <td><input style={{ width: 130 }} value={x.type_action || ''} disabled={locked} onChange={e => setAc(i, 'type_action', e.target.value)} /></td>
              <td><input style={{ width: '100%', minWidth: 200 }} value={x.description || ''} disabled={locked} onChange={e => setAc(i, 'description', e.target.value)} /></td>
              <td><input style={{ width: 110 }} value={x.responsable || ''} disabled={locked} onChange={e => setAc(i, 'responsable', e.target.value)} /></td>
              <td><input type="date" value={x.echeance || ''} disabled={locked} onChange={e => setAc(i, 'echeance', e.target.value)} /></td>
              <td><select value={x.statut || 'a_faire'} disabled={locked} onChange={e => setAc(i, 'statut', e.target.value)}>{ACT_STATUTS.map(s => <option key={s} value={s}>{t('qhse.actstatut.' + s)}</option>)}</select></td>
              <td><input type="date" value={x.date_realisation || ''} disabled={locked} onChange={e => setAc(i, 'date_realisation', e.target.value)} /></td>
              <td>{!locked && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActions(rs => rs.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          ))}
          {actions.length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.ssta.noAction')}</td></tr>}
        </tbody></table></div>
        {!locked && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addAction}>+ {t('qhse.ssta.addAction')}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveActions}>{t('qhse.ana.save')}</button>
        </div>}
      </div>

      {!locked && canClose && <button className="btn btn-secondary" onClick={close}>{t('qhse.ssta.close')}</button>}
      <p style={{ marginTop: 14 }}><Link to="/qhse/sst/accidents">← {t('qhse.ana.backList')}</Link></p>
    </div>
  );
}
