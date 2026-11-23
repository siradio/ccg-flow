import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';

// Sections opératoires de la paillasse microbiologique : suspension mère, préparation des milieux,
// incubation. Embarqué dans le détail d'une analyse de type « microbiologique ». Lecture seule si
// l'analyse est validée.
const b2s = v => (v === true ? 'true' : v === false ? 'false' : '');
const dstr = v => (v ? String(v).slice(0, 10) : '');
const TRI = [['', '—'], ['true', 'OK'], ['false', 'NOK']];

function Tri({ value, onChange, disabled }) {
  return <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
    {TRI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>;
}

export default function QhseMicroForm({ analysisId, locked }) {
  const { t } = useI18n();
  const [mediaRef, setMediaRef] = useState([]);
  const [germs, setGerms] = useState([]);
  const [ops, setOps] = useState({ facteur_dilution: '', type_diluant: '', suspension_tech: '', suspension_date: '', notes: '' });
  const [media, setMedia] = useState([]);
  const [incs, setIncs] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([
      client.get('/qhse/referentials/culture-media'),
      client.get('/qhse/referentials/germs'),
      client.get(`/qhse/analyses/${analysisId}/micro`),
    ]).then(([cm, g, mo]) => {
      setMediaRef(cm.data); setGerms(g.data);
      const d = mo.data || {};
      if (d.operations) setOps({
        facteur_dilution: d.operations.facteur_dilution || '', type_diluant: d.operations.type_diluant || '',
        suspension_tech: d.operations.suspension_tech || '', suspension_date: dstr(d.operations.suspension_date), notes: d.operations.notes || '',
      });
      if (d.media && d.media.length) {
        setMedia(d.media.map(m => ({ ...m, ph_ok: b2s(m.ph_ok), chauffage_ok: b2s(m.chauffage_ok), autoclavage_ok: b2s(m.autoclavage_ok), controle_ok: b2s(m.controle_ok), date_prep: dstr(m.date_prep) })));
      } else {
        setMedia(cm.data.filter(x => x.actif !== false).map(x => ({ culture_media_id: x.id, pesee: '', ph_ok: '', repartition: '', chauffage_ok: '', autoclavage_ok: '', controle_ok: '', date_prep: '', preparateur: '', lot_milieu: '' })));
      }
      setIncs((d.incubations || []).map(i => ({ ...i, debut: dstr(i.debut), fin: dstr(i.fin) })));
    }).catch(() => {});
  }, [analysisId]);

  const setO = (k, v) => setOps(p => ({ ...p, [k]: v }));
  const setM = (i, k, v) => setMedia(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const setI = (i, k, v) => setIncs(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addInc = () => setIncs(rs => [...rs, { germ_id: '', germ_libre: '', temperature: '', duree: '', oxygenation: '', equipement: '', debut: '', fin: '', lot_bp: '', technicien: '' }]);
  const delInc = i => setIncs(rs => rs.filter((_, j) => j !== i));
  const mediaName = id => (mediaRef.find(m => m.id === id)?.libelle || '—');

  async function save() {
    setMsg('');
    await client.put(`/qhse/analyses/${analysisId}/micro`, { operations: ops, media, incubations: incs });
    setMsg(t('qhse.ana.saved'));
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3 style={{ marginTop: 0 }}>{t('qhse.micro.title')}</h3>

      <h4 style={{ margin: '8px 0' }}>{t('qhse.micro.suspension')}</h4>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.micro.dilution')}<input value={ops.facteur_dilution} disabled={locked} onChange={e => setO('facteur_dilution', e.target.value)} /></label>
        <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.micro.diluant')}<input value={ops.type_diluant} disabled={locked} onChange={e => setO('type_diluant', e.target.value)} placeholder="EPT SC / DC" /></label>
        <label className="field" style={{ flex: '1 1 160px' }}>{t('qhse.ana.tech')}<input value={ops.suspension_tech} disabled={locked} onChange={e => setO('suspension_tech', e.target.value)} /></label>
        <label className="field" style={{ flex: '1 1 140px' }}>Date<input type="date" value={ops.suspension_date} disabled={locked} onChange={e => setO('suspension_date', e.target.value)} /></label>
      </div>

      <h4 style={{ margin: '14px 0 8px' }}>{t('qhse.micro.media')}</h4>
      <div className="table-wrap"><table><thead><tr>
        <th>{t('qhse.micro.medium')}</th><th>{t('qhse.micro.pesee')}</th><th>pH</th><th>{t('qhse.micro.repartition')}</th>
        <th>{t('qhse.micro.chauffage')}</th><th>{t('qhse.micro.autoclavage')}</th><th>{t('qhse.micro.controle')}</th><th>Date</th><th>{t('qhse.micro.preparateur')}</th><th>{t('qhse.micro.lotMilieu')}</th>
      </tr></thead><tbody>
        {media.map((m, i) => (
          <tr key={i}>
            <td>{mediaName(m.culture_media_id)}</td>
            <td><input style={{ width: 70 }} value={m.pesee} disabled={locked} onChange={e => setM(i, 'pesee', e.target.value)} /></td>
            <td><Tri value={m.ph_ok} disabled={locked} onChange={v => setM(i, 'ph_ok', v)} /></td>
            <td><input style={{ width: 80 }} value={m.repartition} disabled={locked} onChange={e => setM(i, 'repartition', e.target.value)} /></td>
            <td><Tri value={m.chauffage_ok} disabled={locked} onChange={v => setM(i, 'chauffage_ok', v)} /></td>
            <td><Tri value={m.autoclavage_ok} disabled={locked} onChange={v => setM(i, 'autoclavage_ok', v)} /></td>
            <td><Tri value={m.controle_ok} disabled={locked} onChange={v => setM(i, 'controle_ok', v)} /></td>
            <td><input type="date" value={m.date_prep} disabled={locked} onChange={e => setM(i, 'date_prep', e.target.value)} /></td>
            <td><input style={{ width: 90 }} value={m.preparateur} disabled={locked} onChange={e => setM(i, 'preparateur', e.target.value)} /></td>
            <td><input style={{ width: 80 }} value={m.lot_milieu} disabled={locked} onChange={e => setM(i, 'lot_milieu', e.target.value)} /></td>
          </tr>
        ))}
      </tbody></table></div>

      <h4 style={{ margin: '14px 0 8px' }}>{t('qhse.micro.incubation')}</h4>
      <div className="table-wrap"><table><thead><tr>
        <th>{t('qhse.micro.germ')}</th><th>T°C</th><th>{t('qhse.micro.duree')}</th><th>{t('qhse.micro.oxy')}</th><th>{t('qhse.micro.equip')}</th><th>{t('qhse.micro.debut')}</th><th>{t('qhse.micro.fin')}</th><th>Lot BP</th><th>{t('qhse.ana.tech')}</th><th></th>
      </tr></thead><tbody>
        {incs.map((r, i) => (
          <tr key={i}>
            <td><select value={r.germ_id || ''} disabled={locked} onChange={e => setI(i, 'germ_id', e.target.value)}>
              <option value="">—</option>{germs.map(g => <option key={g.id} value={g.id}>{g.libelle}</option>)}</select></td>
            <td><input style={{ width: 55 }} value={r.temperature || ''} disabled={locked} onChange={e => setI(i, 'temperature', e.target.value)} /></td>
            <td><input style={{ width: 60 }} value={r.duree || ''} disabled={locked} onChange={e => setI(i, 'duree', e.target.value)} /></td>
            <td><input style={{ width: 60 }} value={r.oxygenation || ''} disabled={locked} onChange={e => setI(i, 'oxygenation', e.target.value)} /></td>
            <td><input style={{ width: 90 }} value={r.equipement || ''} disabled={locked} onChange={e => setI(i, 'equipement', e.target.value)} /></td>
            <td><input type="date" value={r.debut || ''} disabled={locked} onChange={e => setI(i, 'debut', e.target.value)} /></td>
            <td><input type="date" value={r.fin || ''} disabled={locked} onChange={e => setI(i, 'fin', e.target.value)} /></td>
            <td><input style={{ width: 70 }} value={r.lot_bp || ''} disabled={locked} onChange={e => setI(i, 'lot_bp', e.target.value)} /></td>
            <td><input style={{ width: 80 }} value={r.technicien || ''} disabled={locked} onChange={e => setI(i, 'technicien', e.target.value)} /></td>
            <td>{!locked && <button type="button" className="btn btn-secondary btn-sm" onClick={() => delInc(i)}>✕</button>}</td>
          </tr>
        ))}
        {incs.length === 0 && <tr><td colSpan={10} className="empty-row">{t('qhse.micro.noIncub')}</td></tr>}
      </tbody></table></div>
      {!locked && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={addInc}>+ {t('qhse.micro.addIncub')}</button>}

      {msg && <div className="alert" style={{ marginTop: 10 }}>{msg}</div>}
      {!locked && <div style={{ marginTop: 12 }}><button type="button" className="btn btn-primary" onClick={save}>{t('qhse.micro.save')}</button></div>}
    </div>
  );
}
