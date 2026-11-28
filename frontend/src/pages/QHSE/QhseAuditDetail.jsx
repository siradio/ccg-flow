import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const TYPES = ['interne', 'externe', 'fournisseur'];
const WF = ['planifie', 'realise'];
const CONSTAT_TYPES = ['non_conformite', 'observation', 'point_fort', 'conformite'];
const ACT_STATUTS = ['a_faire', 'en_cours', 'faite'];
const dstr = v => (v ? String(v).slice(0, 10) : '');

export default function QhseAuditDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const canClose = hasSubModuleLevel(user, 'qhse.audits', 'edition');
  const [a, setA] = useState(null);
  const [bus, setBus] = useState([]);
  const [hdr, setHdr] = useState({});
  const [findings, setFindings] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const apply = d => {
    setA(d);
    setHdr({ date_audit: dstr(d.date_audit), type_audit: d.type_audit || 'interne', perimetre: d.perimetre || '',
      auditeur: d.auditeur || '', referentiel: d.referentiel || '', business_unit_id: d.business_unit_id || '',
      synthese: d.synthese || '', statut: d.statut || 'planifie' });
    setFindings((d.findings || []).map(x => ({ ...x, echeance: dstr(x.echeance) })));
  };
  useEffect(() => {
    client.get(`/qhse/audits/${id}`).then(r => apply(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, [id]);

  const locked = a?.statut === 'cloture';
  const setH = (k, v) => setHdr(p => ({ ...p, [k]: v }));
  const setF = (i, k, v) => setFindings(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addFinding = () => setFindings(rs => [...rs, { type_constat: 'non_conformite', description: '', reference: '', action: '', responsable: '', echeance: '', statut: 'a_faire' }]);
  const flash = m => { setMsg(m); setErr(''); };
  const fail = e => { setErr(e.response?.data?.error || t('rh.saveError')); setMsg(''); };

  const saveHeader = () => client.put(`/qhse/audits/${id}`, hdr).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  const saveFindings = () => client.put(`/qhse/audits/${id}/findings`, { findings }).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  const close = () => client.post(`/qhse/audits/${id}/close`).then(r => { apply(r.data); flash(t('qhse.aud.closed')); }).catch(fail);

  if (!a) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{a.numero} · {a.perimetre || ''}</h1>
      <div style={{ marginBottom: 12 }}><span className="muted">{t('qhse.audstatut.' + a.statut)}</span></div>
      {err && <div className="alert alert-danger" style={{ maxWidth: 760 }}>{err}</div>}
      {msg && <div className="alert" style={{ maxWidth: 760 }}>{msg}</div>}

      <div className="card" style={{ maxWidth: 760, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.aud.secInfo')}</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.aud.date')}<input type="date" value={hdr.date_audit} disabled={locked} onChange={e => setH('date_audit', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.aud.type')}<select value={hdr.type_audit} disabled={locked} onChange={e => setH('type_audit', e.target.value)}>{TYPES.map(x => <option key={x} value={x}>{t('qhse.audtype.' + x)}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 140px' }}>BU<select value={hdr.business_unit_id} disabled={locked} onChange={e => setH('business_unit_id', e.target.value)}><option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.ana.statut')}<select value={hdr.statut} disabled={locked} onChange={e => setH('statut', e.target.value)}>{WF.map(s => <option key={s} value={s}>{t('qhse.audstatut.' + s)}</option>)}</select></label>
        </div>
        <label className="field">{t('qhse.aud.perimetre')}<input value={hdr.perimetre} disabled={locked} onChange={e => setH('perimetre', e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.aud.auditeur')}<input value={hdr.auditeur} disabled={locked} onChange={e => setH('auditeur', e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 180px' }}>{t('qhse.aud.referentiel')}<input value={hdr.referentiel} disabled={locked} onChange={e => setH('referentiel', e.target.value)} /></label>
        </div>
        <label className="field">{t('qhse.aud.synthese')}<textarea rows={3} value={hdr.synthese} disabled={locked} onChange={e => setH('synthese', e.target.value)} /></label>
        {!locked && <div><button className="btn btn-primary" onClick={saveHeader}>{t('qhse.ana.save')}</button></div>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.aud.secConstats')}</h3>
        <div className="table-wrap"><table><thead><tr>
          <th>{t('qhse.aud.constatType')}</th><th>{t('qhse.aud.constat')}</th><th>{t('qhse.aud.reference')}</th>
          <th>{t('qhse.nc.action')}</th><th>{t('qhse.nc.responsable')}</th><th>{t('qhse.nc.echeance')}</th><th>{t('qhse.ana.statut')}</th><th></th>
        </tr></thead><tbody>
          {findings.map((x, i) => (
            <tr key={i}>
              <td><select value={x.type_constat || ''} disabled={locked} onChange={e => setF(i, 'type_constat', e.target.value)}>{CONSTAT_TYPES.map(c => <option key={c} value={c}>{t('qhse.constat.' + c)}</option>)}</select></td>
              <td><input style={{ width: '100%', minWidth: 200 }} value={x.description || ''} disabled={locked} onChange={e => setF(i, 'description', e.target.value)} /></td>
              <td><input style={{ width: 100 }} value={x.reference || ''} disabled={locked} onChange={e => setF(i, 'reference', e.target.value)} /></td>
              <td><input style={{ width: '100%', minWidth: 160 }} value={x.action || ''} disabled={locked} onChange={e => setF(i, 'action', e.target.value)} /></td>
              <td><input style={{ width: 110 }} value={x.responsable || ''} disabled={locked} onChange={e => setF(i, 'responsable', e.target.value)} /></td>
              <td><input type="date" value={x.echeance || ''} disabled={locked} onChange={e => setF(i, 'echeance', e.target.value)} /></td>
              <td><select value={x.statut || 'a_faire'} disabled={locked} onChange={e => setF(i, 'statut', e.target.value)}>{ACT_STATUTS.map(s => <option key={s} value={s}>{t('qhse.actstatut.' + s)}</option>)}</select></td>
              <td>{!locked && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFindings(rs => rs.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          ))}
          {findings.length === 0 && <tr><td colSpan={8} className="empty-row">{t('qhse.aud.noConstat')}</td></tr>}
        </tbody></table></div>
        {!locked && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addFinding}>+ {t('qhse.aud.addConstat')}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveFindings}>{t('qhse.ana.save')}</button>
        </div>}
      </div>

      {!locked && canClose && <button className="btn btn-secondary" onClick={close}>{t('qhse.aud.close')}</button>}
      <p style={{ marginTop: 14 }}><Link to="/qhse/audits">← {t('qhse.ana.backList')}</Link></p>
    </div>
  );
}
