import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import Modal from '../../components/Modal.jsx';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import DsiSubnav from './DsiSubnav';
import EquipmentForm from './EquipmentForm.jsx';
import { EquipStatutBadge, BENEFICIAIRE_TYPES, ETATS, beneficiaireLabel } from './dsiLabels.jsx';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR'));

export default function ParcDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const canEditParc = hasSubModuleLevel(user, 'dsi.parc', 'edition');
  const canAssign = hasSubModuleLevel(user, 'dsi.affectations', 'edition');
  const [eq, setEq] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'edit' | 'assign' | 'transfer' | 'return'
  const [lists, setLists] = useState({ categories: [], types: [], brands: [], entities: [], sites: [], suppliers: [], employees: [], bus: [] });

  const dfmt = (d) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—');
  const load = () => Promise.all([
    client.get(`/dsi/equipment/${id}`).then(r => setEq(r.data)),
    client.get(`/dsi/equipment/${id}/assignments`).then(r => setAssignments(r.data)),
  ]).catch(e => setError(e.response?.data?.error || 'Erreur de chargement.'));

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    Promise.all([
      client.get('/dsi/referentials/categories').then(r => r.data.map(c => ({ id: c.id, nom: c.libelle }))).catch(() => []),
      client.get('/dsi/referentials/types').then(r => r.data.map(x => ({ id: x.id, nom: x.libelle, category_id: x.category_id }))).catch(() => []),
      client.get('/dsi/referentials/brands').then(r => r.data.map(x => ({ id: x.id, nom: x.nom }))).catch(() => []),
      client.get('/entities').then(r => r.data).catch(() => []),
      client.get('/sites').then(r => r.data).catch(() => []),
      client.get('/suppliers').then(r => r.data.map(s => ({ id: s.id, nom: s.nom }))).catch(() => []),
      client.get('/rh/employees').then(r => r.data.map(e => ({ id: e.id, nom: `${e.matricule ? e.matricule + ' — ' : ''}${e.prenom || ''} ${e.nom || ''}`.trim() }))).catch(() => []),
      client.get('/business-units/mine').then(r => r.data.map(b => ({ id: b.id, nom: b.nom || b.code }))).catch(() => []),
    ]).then(([categories, types, brands, entities, sites, suppliers, employees, bus]) =>
      setLists({ categories, types, brands, entities, sites, suppliers, employees, bus }));
  }, []);

  if (error && !eq) return <div><DsiSubnav /><div className="alert alert-danger" style={{ maxWidth: 720 }}>{error}</div></div>;
  if (!eq) return <div><DsiSubnav /><p>{t('dsi.loading')}</p></div>;

  const active = assignments.find(a => a.statut === 'active');
  const Row = ({ label, children }) => (<><span style={{ color: 'var(--color-text-muted)' }}>{label}</span><span>{children}</span></>);

  async function saveEdit(payload) { await client.put(`/dsi/equipment/${id}`, payload); setModal(null); await load(); }

  return (
    <div>
      <DsiSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {eq.numero_inventaire} <span style={{ verticalAlign: 'middle' }}><EquipStatutBadge statut={eq.statut} /></span>
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEditParc && <button className="btn btn-secondary btn-sm" onClick={() => setModal('edit')}>{t('common.edit')}</button>}
          {canAssign && !active && <button className="btn btn-primary btn-sm" onClick={() => setModal('assign')}>{t('dsi.action.assign')}</button>}
          {canAssign && active && <button className="btn btn-secondary btn-sm" onClick={() => setModal('transfer')}>{t('dsi.action.transfer')}</button>}
          {canAssign && active && <button className="btn btn-secondary btn-sm" onClick={() => setModal('return')}>{t('dsi.action.return')}</button>}
          <Link to="/dsi/parc" className="btn btn-secondary btn-sm">{t('dsi.action.backList')}</Link>
        </div>
      </div>

      <section className="card" style={{ maxWidth: 900, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{eq.designation}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '8px 18px', fontSize: 14 }}>
          <Row label={t('dsi.eq.categorie')}>{eq.categorie || '—'}</Row>
          <Row label={t('dsi.eq.type')}>{eq.type_libelle || '—'}</Row>
          <Row label={t('dsi.eq.marque')}>{eq.marque || '—'}</Row>
          <Row label={t('dsi.eq.modele')}>{eq.modele || '—'}</Row>
          <Row label={t('dsi.eq.serie')}>{eq.num_serie || '—'}</Row>
          <Row label={t('dsi.eq.etat')}>{eq.etat || '—'}</Row>
          <Row label={t('dsi.eq.entity')}>{eq.entity_nom || '—'}</Row>
          <Row label={t('dsi.eq.site')}>{eq.site_nom || '—'}</Row>
          <Row label={t('dsi.eq.localisation')}>{eq.localisation || '—'}</Row>
          <Row label={t('dsi.eq.fournisseur')}>{eq.fournisseur || '—'}</Row>
          <Row label={t('dsi.eq.dateAchat')}>{dfmt(eq.date_achat)}</Row>
          <Row label={t('dsi.eq.prixAchat')}>{money(eq.prix_achat)}</Row>
          <Row label={t('dsi.eq.miseService')}>{dfmt(eq.date_mise_service)}</Row>
          <Row label={t('dsi.eq.finGarantie')}>{dfmt(eq.fin_garantie)}</Row>
        </div>
        {eq.commentaire && <p style={{ marginTop: 12, fontSize: 14 }}><span style={{ color: 'var(--color-text-muted)' }}>{t('dsi.eq.commentaire')} : </span>{eq.commentaire}</p>}
      </section>

      <section className="card" style={{ maxWidth: 900, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('dsi.assign.history')}</h2>
        {active && (
          <div className="alert" style={{ background: '#dbeafe', color: '#1d4ed8', marginBottom: 10 }}>
            {t('dsi.assign.current')} : <strong>{active.employee_nom || active.bu_nom || active.entity_code || active.site_nom}</strong> ({beneficiaireLabel(active.beneficiaire_type)}) — {t('dsi.assign.since')} {dfmt(active.date_affectation)}
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>{t('dsi.assign.beneficiaire')}</th><th>{t('dsi.assign.type')}</th><th>{t('dsi.assign.dateAff')}</th>
              <th>{t('dsi.assign.par')}</th><th>{t('dsi.assign.retour')}</th><th>{t('dsi.assign.statut')}</th>
            </tr></thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id}>
                  <td>{a.employee_nom || a.bu_nom || a.entity_code || a.site_nom || '—'}</td>
                  <td>{beneficiaireLabel(a.beneficiaire_type)}</td>
                  <td>{dfmt(a.date_affectation)}</td>
                  <td>{a.affecte_par_nom || '—'}</td>
                  <td>{a.statut === 'active' ? dfmt(a.retour_prevu) : `${dfmt(a.date_restitution)} (${a.motif_cloture || '—'})`}</td>
                  <td>{a.statut === 'active' ? t('dsi.assign.active') : t('dsi.assign.closed')}</td>
                </tr>
              ))}
              {assignments.length === 0 && <tr><td className="empty-row" colSpan={6}>{t('dsi.assign.none')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {modal === 'edit' && <EquipmentForm initial={eq} lists={lists} onClose={() => setModal(null)} onSubmit={saveEdit} />}
      {(modal === 'assign' || modal === 'transfer') && (
        <AssignForm mode={modal} lists={lists} onClose={() => setModal(null)}
          onSubmit={async (payload) => { await client.post(`/dsi/equipment/${id}/${modal === 'assign' ? 'assign' : 'transfer'}`, payload); setModal(null); await load(); }} />
      )}
      {modal === 'return' && (
        <ReturnForm onClose={() => setModal(null)}
          onSubmit={async (payload) => { await client.post(`/dsi/equipment/${id}/return`, payload); setModal(null); await load(); }} />
      )}
    </div>
  );
}

function AssignForm({ mode, lists, onClose, onSubmit }) {
  const { t } = useI18n();
  const [f, setF] = useState({ beneficiaire_type: 'employe', employee_id: '', business_unit_id: '', entity_id: '', site_id: '', date_affectation: new Date().toISOString().slice(0, 10), etat_remise: '', accessoires_remis: '', retour_prevu: '', commentaire: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const sites = useMemo(() => (lists.sites || []).filter(s => !f.entity_id || String(s.entity_id) === String(f.entity_id)), [lists.sites, f.entity_id]);
  async function submit(e) { e.preventDefault(); if (busy) return; setBusy(true); setErr(''); try { await onSubmit(f); } catch (e2) { setErr(e2.response?.data?.error || 'Erreur.'); setBusy(false); } }
  const Field = ({ label, children }) => (<label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)' }}>{label}{children}</label>);
  return (
    <Modal title={mode === 'assign' ? t('dsi.action.assign') : t('dsi.action.transfer')} onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <Field label={t('dsi.assign.type')}>
            <select value={f.beneficiaire_type} onChange={e => set('beneficiaire_type', e.target.value)}>
              {BENEFICIAIRE_TYPES.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
            </select>
          </Field>
          {f.beneficiaire_type === 'employe' && <Field label={t('dsi.assign.beneficiaire')}><SearchableSelect value={f.employee_id} onChange={v => set('employee_id', v ?? '')} options={lists.employees} getLabel={o => o.nom} placeholder="Salarié…" /></Field>}
          {f.beneficiaire_type === 'service' && <Field label={t('dsi.assign.beneficiaire')}><SearchableSelect value={f.business_unit_id} onChange={v => set('business_unit_id', v ?? '')} options={lists.bus} getLabel={o => o.nom} placeholder="Service…" /></Field>}
          {f.beneficiaire_type === 'filiale' && <Field label={t('dsi.assign.beneficiaire')}><select value={f.entity_id} onChange={e => set('entity_id', e.target.value)}><option value="">—</option>{lists.entities.map(en => <option key={en.id} value={en.id}>{en.code || en.nom}</option>)}</select></Field>}
          {f.beneficiaire_type === 'site' && <>
            <Field label="Filiale"><select value={f.entity_id} onChange={e => { set('entity_id', e.target.value); set('site_id', ''); }}><option value="">—</option>{lists.entities.map(en => <option key={en.id} value={en.id}>{en.code || en.nom}</option>)}</select></Field>
            <Field label={t('dsi.assign.beneficiaire')}><select value={f.site_id} onChange={e => set('site_id', e.target.value)}><option value="">—</option>{sites.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></Field>
          </>}
          <Field label={t('dsi.assign.dateAff')}><input type="date" value={f.date_affectation} onChange={e => set('date_affectation', e.target.value)} /></Field>
          <Field label={t('dsi.assign.etatRemise')}><input value={f.etat_remise} onChange={e => set('etat_remise', e.target.value)} /></Field>
          <Field label={t('dsi.assign.accessoires')}><input value={f.accessoires_remis} onChange={e => set('accessoires_remis', e.target.value)} /></Field>
          <Field label={t('dsi.assign.retourPrevu')}><input type="date" value={f.retour_prevu} onChange={e => set('retour_prevu', e.target.value)} /></Field>
        </div>
        {err && <div className="alert alert-danger" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '…' : t('common.confirm')}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReturnForm({ onClose, onSubmit }) {
  const { t } = useI18n();
  const [f, setF] = useState({ date_restitution: new Date().toISOString().slice(0, 10), etat_restitution: '', accessoires_restitues: '', anomalies: '', commentaire: '', new_statut: 'disponible' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  async function submit(e) { e.preventDefault(); if (busy) return; setBusy(true); setErr(''); try { await onSubmit(f); } catch (e2) { setErr(e2.response?.data?.error || 'Erreur.'); setBusy(false); } }
  const Field = ({ label, children }) => (<label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--color-text-muted)' }}>{label}{children}</label>);
  return (
    <Modal title={t('dsi.action.return')} onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <Field label={t('dsi.return.date')}><input type="date" value={f.date_restitution} onChange={e => set('date_restitution', e.target.value)} /></Field>
          <Field label={t('dsi.return.etat')}><select value={f.etat_restitution} onChange={e => set('etat_restitution', e.target.value)}><option value="">—</option>{ETATS.map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
          <Field label={t('dsi.return.accessoires')}><input value={f.accessoires_restitues} onChange={e => set('accessoires_restitues', e.target.value)} /></Field>
          <Field label={t('dsi.return.newStatut')}>
            <select value={f.new_statut} onChange={e => set('new_statut', e.target.value)}>
              <option value="disponible">Disponible</option><option value="en_stock">En stock</option>
              <option value="en_maintenance">En maintenance</option><option value="en_panne">En panne</option>
              <option value="reforme">Réformé</option>
            </select>
          </Field>
        </div>
        <Field label={t('dsi.return.anomalies')}><textarea rows={2} value={f.anomalies} onChange={e => set('anomalies', e.target.value)} /></Field>
        {err && <div className="alert alert-danger" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '…' : t('common.confirm')}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}
