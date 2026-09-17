import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import DsiSubnav from './DsiSubnav';
import { useI18n } from '../../i18n/I18nContext';

const MONTHS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const money = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
async function openPdf(path) { const res = await client.get(path, { responseType: 'blob' }); const url = URL.createObjectURL(res.data); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
const SYNTHESE = [['resume', 'Résumé du mois'], ['realisations', 'Principales réalisations'], ['difficultes', 'Difficultés rencontrées'], ['risques', 'Risques'], ['attention', 'Points nécessitant l’attention de la Direction'], ['recommandations', 'Recommandations'], ['decisions', 'Décisions / arbitrages attendus']];

export default function RapportDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const canEdit = hasSubModuleLevel(user, 'dsi.rapports', 'edition');
  const [r, setR] = useState(null);
  const [sections, setSections] = useState(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [newAction, setNewAction] = useState('');
  const load = () => client.get(`/dsi/reports/${id}`).then(res => { setR(res.data); setSections(res.data.payload?.sections || { synthese: {}, analyses: {} }); }).catch(e => setError(e.response?.data?.error || 'Erreur.'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (error && !r) return <div><DsiSubnav /><div className="alert alert-danger" style={{ maxWidth: 640 }}>{error}</div></div>;
  if (!r) return <div><DsiSubnav /><p>{t('dsi.loading')}</p></div>;
  const locked = r.verrouille;
  const snap = r.payload?.snapshot || {}; const c = snap.chiffres || {}; const tk = c.tickets || {}; const parc = c.parc || {};
  const setSyn = (k, v) => setSections(s => ({ ...s, synthese: { ...s.synthese, [k]: v } }));
  const setAna = (k, v) => setSections(s => ({ ...s, analyses: { ...s.analyses, [k]: v } }));
  const act = async (fn, msg) => { setBusy(true); setError(''); setNotice(''); try { await fn(); await load(); if (msg) setNotice(msg); } catch (e) { setError(e.response?.data?.error || 'Erreur.'); } finally { setBusy(false); } };

  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('dsi.rep.title')} — {MONTHS[r.mois]} {r.annee} {r.entity_code ? `(${r.entity_code})` : ''}</h1>
        <Link to="/dsi/rapports" className="btn btn-secondary btn-sm">{t('dsi.action.backList')}</Link>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
        <span className="card" style={{ padding: '4px 10px', fontSize: 13 }}>{t('dsi.rep.statut')} : <strong>{r.statut}</strong>{r.valide_par_nom ? ` · ${r.valide_par_nom}` : ''}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => openPdf(`/dsi/reports/${id}/pdf`)}>{t('dsi.rep.pdf')}</button>
        {canEdit && !locked && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => client.post('/dsi/reports/generate', { annee: r.annee, mois: r.mois, entity_id: r.entity_id }), t('dsi.rep.regenerated'))}>{t('dsi.rep.regenerate')}</button>}
        {canEdit && r.statut === 'brouillon' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => client.post(`/dsi/reports/${id}/submit`))}>{t('dsi.rep.submit')}</button>}
        {canEdit && r.statut === 'a_valider' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(() => client.post(`/dsi/reports/${id}/validate`), t('dsi.rep.validated'))}>{t('dsi.rep.validate')}</button>}
        {canEdit && r.statut === 'valide' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(() => client.post(`/dsi/reports/${id}/diffuse`))}>{t('dsi.rep.diffuse')}</button>}
        {canEdit && locked && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => client.post(`/dsi/reports/${id}/reopen`))}>{t('dsi.rep.reopen')}</button>}
      </div>
      {notice && <div className="alert alert-success" style={{ maxWidth: 720, marginTop: 10 }}>{notice}</div>}
      {error && <div className="alert alert-danger" style={{ maxWidth: 720, marginTop: 10 }}>{error}</div>}
      {locked && <div className="alert" style={{ background: 'var(--color-hover)', color: 'var(--color-text-muted)', marginTop: 10, maxWidth: 720 }}>{t('dsi.rep.lockedInfo')}</div>}

      {/* Chiffres clés (snapshot) */}
      <section className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('dsi.rep.kpis')}</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <KPI label={t('dsi.tk.stat.open').replace('Ouverts', 'Tickets reçus')} v={tk.recus} />
          <KPI label="Résolus" v={tk.resolus} />
          <KPI label="Ouverts" v={tk.ouverts} />
          <KPI label="Incidents critiques" v={tk.incidents_critiques} accent="#b91c1c" />
          <KPI label="Taux résolution" v={tk.taux_resolution == null ? '—' : tk.taux_resolution + '%'} />
          <KPI label="Respect SLA" v={tk.sla_pct == null ? '—' : tk.sla_pct + '%'} />
          <KPI label="MTTR" v={tk.mttr_min == null ? '—' : tk.mttr_min + ' min'} />
          <KPI label="Parc total" v={parc.total} />
          <KPI label="Hors garantie" v={parc.hors_garantie} />
        </div>
      </section>

      {/* Synthèse exécutive éditable */}
      <section className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('dsi.rep.synthese')}</h2>
        {sections && SYNTHESE.map(([k, label]) => (
          <label key={k} className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>{label}
            <textarea rows={2} value={sections.synthese?.[k] || ''} disabled={locked || !canEdit} onChange={e => setSyn(k, e.target.value)} />
          </label>
        ))}
        <h3 style={{ fontSize: 13 }}>{t('dsi.rep.analyses')}</h3>
        {[['sla', 'SLA / performance'], ['maintenance', 'Maintenance'], ['securite', 'Sécurité']].map(([k, label]) => (
          <label key={k} className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>{label}
            <textarea rows={2} value={sections.analyses?.[k] || ''} disabled={locked || !canEdit} onChange={e => setAna(k, e.target.value)} />
          </label>
        ))}
        {canEdit && !locked && <button className="btn btn-primary" disabled={busy} onClick={() => act(() => client.put(`/dsi/reports/${id}`, { sections }), t('dsi.rep.saved'))}>{t('common.save')}</button>}
      </section>

      {/* Plan d'action */}
      <section className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('dsi.rep.plan')}</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {(r.actions || []).map(a => (
            <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14, borderBottom: '1px solid var(--color-border)' }}>
              <span>{a.libelle} {a.echeance ? `· ${new Date(a.echeance).toLocaleDateString('fr-FR')}` : ''} <em style={{ color: 'var(--color-text-muted)' }}>({a.statut})</em></span>
              {canEdit && !locked && <button className="link-button" onClick={() => act(() => client.delete(`/dsi/reports/actions/${a.id}`))}>×</button>}
            </li>
          ))}
          {(r.actions || []).length === 0 && <li style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('dsi.rep.noAction')}</li>}
        </ul>
        {canEdit && !locked && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input value={newAction} onChange={e => setNewAction(e.target.value)} placeholder={t('dsi.rep.addAction')} style={{ flex: 1 }} />
            <button className="btn btn-secondary btn-sm" disabled={!newAction.trim()} onClick={() => act(() => client.post(`/dsi/reports/${id}/actions`, { libelle: newAction }).then(() => setNewAction('')))}>{t('common.add')}</button>
          </div>
        )}
      </section>
    </div>
  );
}

function KPI({ label, v, accent }) {
  return (<div className="card" style={{ minWidth: 110, flex: '1 1 120px' }}>
    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: accent || 'var(--color-text)' }}>{v ?? '—'}</div>
  </div>);
}
