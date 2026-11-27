import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const dstr = v => (v ? String(v).slice(0, 10) : '');
const EMPTY_V = { date_verif: '', type_verif: 'verification', resultat: 'conforme', prochaine_echeance: '', operateur: '', organisme: '', commentaire: '' };

export default function QhseEquipmentDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const canEdit = hasSubModuleLevel(user, 'qhse.equipment', 'ajout');
  const [e, setE] = useState(null);
  const [bus, setBus] = useState([]);
  const [hdr, setHdr] = useState({});
  const [v, setV] = useState(EMPTY_V);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const apply = d => {
    setE(d);
    setHdr({ code: d.code || '', libelle: d.libelle || '', type: d.type || '', localisation: d.localisation || '',
      business_unit_id: d.business_unit_id || '', criticite: d.criticite || '', frequence_mois: d.frequence_mois ?? '',
      derniere_verif: dstr(d.derniere_verif), prochaine_verif: dstr(d.prochaine_verif), statut: d.statut || 'en_service', commentaire: d.commentaire || '' });
  };
  useEffect(() => {
    client.get(`/qhse/equipment/${id}`).then(r => apply(r.data)).catch(() => {});
    client.get('/business-units').then(r => setBus(r.data)).catch(() => {});
  }, [id]);

  const setH = (k, val) => setHdr(p => ({ ...p, [k]: val }));
  const setVf = (k, val) => setV(p => ({ ...p, [k]: val }));
  const flash = m => { setMsg(m); setErr(''); };
  const fail = x => { setErr(x.response?.data?.error || t('rh.saveError')); setMsg(''); };

  const saveHeader = () => client.put(`/qhse/equipment/${id}`, hdr).then(r => { apply(r.data); flash(t('qhse.ana.saved')); }).catch(fail);
  const addVerif = () => client.post(`/qhse/equipment/${id}/verifications`, v).then(r => { apply(r.data); setV(EMPTY_V); flash(t('qhse.ana.saved')); }).catch(fail);
  const delVerif = (vid) => client.delete(`/qhse/equipment/${id}/verifications/${vid}`).then(r => apply(r.data)).catch(fail);

  if (!e) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{e.libelle}{e.code ? ` · ${e.code}` : ''}</h1>
      {err && <div className="alert alert-danger" style={{ maxWidth: 760 }}>{err}</div>}
      {msg && <div className="alert" style={{ maxWidth: 760 }}>{msg}</div>}

      <div className="card" style={{ maxWidth: 760, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.eq.secInfo')}</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 120px' }}>{t('qhse.eq.code')}<input value={hdr.code} disabled={!canEdit} onChange={ev => setH('code', ev.target.value)} /></label>
          <label className="field" style={{ flex: '2 1 220px' }}>{t('qhse.eq.libelle')}<input value={hdr.libelle} disabled={!canEdit} onChange={ev => setH('libelle', ev.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.eq.type')}<input value={hdr.type} disabled={!canEdit} onChange={ev => setH('type', ev.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.eq.localisation')}<input value={hdr.localisation} disabled={!canEdit} onChange={ev => setH('localisation', ev.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 140px' }}>BU<select value={hdr.business_unit_id} disabled={!canEdit} onChange={ev => setH('business_unit_id', ev.target.value)}><option value="">—</option>{bus.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
          <label className="field" style={{ flex: '1 1 130px' }}>{t('qhse.eq.criticite')}<select value={hdr.criticite} disabled={!canEdit} onChange={ev => setH('criticite', ev.target.value)}><option value="">—</option><option value="critique">{t('qhse.eq.critique')}</option><option value="normale">{t('qhse.eq.normale')}</option></select></label>
          <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.ana.statut')}<select value={hdr.statut} disabled={!canEdit} onChange={ev => setH('statut', ev.target.value)}>{['en_service', 'hors_service', 'reforme'].map(s => <option key={s} value={s}>{t('qhse.eqstatut.' + s)}</option>)}</select></label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 120px' }}>{t('qhse.eq.frequence')}<input type="number" min="0" value={hdr.frequence_mois} disabled={!canEdit} onChange={ev => setH('frequence_mois', ev.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.eq.derniere')}<input type="date" value={hdr.derniere_verif} disabled={!canEdit} onChange={ev => setH('derniere_verif', ev.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 150px' }}>{t('qhse.eq.prochaine')}<input type="date" value={hdr.prochaine_verif} disabled={!canEdit} onChange={ev => setH('prochaine_verif', ev.target.value)} /></label>
        </div>
        <label className="field">{t('qhse.sev.commentaire')}<textarea rows={2} value={hdr.commentaire} disabled={!canEdit} onChange={ev => setH('commentaire', ev.target.value)} /></label>
        {canEdit && <div><button className="btn btn-primary" onClick={saveHeader}>{t('qhse.ana.save')}</button></div>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('qhse.eq.secVerif')}</h3>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <label className="field" style={{ width: 140 }}>{t('qhse.eq.vdate')}<input type="date" value={v.date_verif} onChange={ev => setVf('date_verif', ev.target.value)} /></label>
            <label className="field" style={{ width: 150 }}>{t('qhse.eq.vtype')}<select value={v.type_verif} onChange={ev => setVf('type_verif', ev.target.value)}>{['etalonnage', 'verification', 'maintenance'].map(x => <option key={x} value={x}>{t('qhse.eqvtype.' + x)}</option>)}</select></label>
            <label className="field" style={{ width: 150 }}>{t('qhse.eq.vresultat')}<select value={v.resultat} onChange={ev => setVf('resultat', ev.target.value)}>{['conforme', 'non_conforme', 'na'].map(x => <option key={x} value={x}>{t('qhse.eqres.' + x)}</option>)}</select></label>
            <label className="field" style={{ width: 150 }}>{t('qhse.eq.vechance')}<input type="date" value={v.prochaine_echeance} onChange={ev => setVf('prochaine_echeance', ev.target.value)} /></label>
            <label className="field" style={{ width: 130 }}>{t('qhse.eq.operateur')}<input value={v.operateur} onChange={ev => setVf('operateur', ev.target.value)} /></label>
            <label className="field" style={{ width: 150 }}>{t('qhse.eq.organisme')}<input value={v.organisme} onChange={ev => setVf('organisme', ev.target.value)} /></label>
            <button className="btn btn-secondary btn-sm" onClick={addVerif} disabled={!v.date_verif}>+ {t('qhse.eq.addVerif')}</button>
          </div>
        )}
        <div className="table-wrap"><table><thead><tr>
          <th>{t('qhse.eq.vdate')}</th><th>{t('qhse.eq.vtype')}</th><th>{t('qhse.eq.vresultat')}</th><th>{t('qhse.eq.vechance')}</th><th>{t('qhse.eq.operateur')}</th><th>{t('qhse.eq.organisme')}</th><th></th>
        </tr></thead><tbody>
          {(e.verifications || []).map(x => (
            <tr key={x.id}>
              <td>{dstr(x.date_verif) || '—'}</td><td>{x.type_verif ? t('qhse.eqvtype.' + x.type_verif) : '—'}</td>
              <td>{x.resultat ? t('qhse.eqres.' + x.resultat) : '—'}</td><td>{dstr(x.prochaine_echeance) || '—'}</td>
              <td>{x.operateur || '—'}</td><td>{x.organisme || '—'}</td>
              <td>{canEdit && <button className="btn btn-secondary btn-sm" onClick={() => delVerif(x.id)}>✕</button>}</td>
            </tr>
          ))}
          {(e.verifications || []).length === 0 && <tr><td colSpan={7} className="empty-row">{t('qhse.eq.noVerif')}</td></tr>}
        </tbody></table></div>
      </div>

      <p><Link to="/qhse/equipements">← {t('qhse.ana.backList')}</Link></p>
    </div>
  );
}
