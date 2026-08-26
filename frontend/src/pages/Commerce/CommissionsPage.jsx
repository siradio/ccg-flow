import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth, hasSubModuleLevel } from '../../auth/AuthContext';
import CommerceSubnav from './CommerceSubnav';
import { ExportButtons } from '../../utils/exportData';
import { useI18n } from '../../i18n/I18nContext';

const money = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' GNF';
const curMonth = () => new Date().toISOString().slice(0, 7);
const STATUT_COLOR = { calculee: '#6b7280', validee: '#2554e0', payee: '#128a54', annulee: '#dc2626' };

export default function CommissionsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const statutLabel = (s) => t('com.commStatut.' + s);
  const [mois, setMois] = useState(curMonth());
  const [rows, setRows] = useState([]);
  const [bareme, setBareme] = useState([]);
  const [bus, setBus] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showBareme, setShowBareme] = useState(false);
  const [newTier, setNewTier] = useState({ business_unit_id: '', palier_min: 0, taux: 1 });
  const canEdit = hasSubModuleLevel(user, 'commerce.commissions', 'edition');

  function load() {
    client.get('/commerce/commissions?mois=' + mois).then(r => setRows(r.data)).catch(() => {});
  }
  function loadBareme() { client.get('/commerce/commissions/bareme').then(r => setBareme(r.data)).catch(() => {}); }
  useEffect(load, [mois]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadBareme(); client.get('/business-units/mine').then(r => setBus(r.data)).catch(() => {}); }, []);

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.montant || 0), 0), [rows]);

  async function calculer() {
    setBusy(true); setMsg('');
    try { const r = await client.post('/commerce/commissions/calculer', { mois }); setMsg(t('com.comm.computed', { n: r.data.computed }) + (r.data.lockedSkipped ? t('com.comm.lockedSkipped', { n: r.data.lockedSkipped }) : '') + '.'); load(); }
    catch (e) { setMsg(e.response?.data?.error || t('com.comm.error')); }
    finally { setBusy(false); }
  }
  async function act(id, path, body) {
    try { await client.post(`/commerce/commissions/${id}/${path}`, body || {}); load(); }
    catch (e) { setMsg(e.response?.data?.error || t('com.comm.actionError')); }
  }
  async function addTier() {
    await client.post('/commerce/commissions/bareme', { business_unit_id: newTier.business_unit_id || null, palier_min: Number(newTier.palier_min) || 0, taux: (Number(newTier.taux) || 0) / 100 });
    setNewTier({ business_unit_id: '', palier_min: 0, taux: 1 }); loadBareme();
  }
  async function delTier(id) { if (window.confirm(t('com.comm.confirmDeleteTier'))) { await client.delete('/commerce/commissions/bareme/' + id); loadBareme(); } }

  // Libellés de statut pour l'EXPORT (document généré) : toujours en français, indépendamment de la langue de l'interface.
  const STATUT_LABEL_FR = { calculee: 'Calculée', validee: 'Validée', payee: 'Payée', annulee: 'Annulée' };
  const exportCols = [
    { key: 'commercial_code', label: 'Code' }, { key: 'commercial_nom', label: 'Commercial' },
    { key: 'business_unit_nom', label: 'BU' }, { key: 'base_montant', label: 'Base (CA)', type: 'number' },
    { key: 'tauxPct', label: 'Taux %' }, { key: 'montant', label: 'Commission', type: 'number' }, { key: 'statutLabel', label: 'Statut' },
  ];
  const exportRows = rows.map(r => ({ ...r, commercial_nom: `${r.commercial_prenom || ''} ${r.commercial_nom || ''}`.trim(), tauxPct: (Number(r.taux) * 100).toLocaleString('fr-FR'), statutLabel: STATUT_LABEL_FR[r.statut] }));

  return (
    <div>
      <CommerceSubnav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('com.comm.title')}</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={mois} onChange={e => setMois(e.target.value)} />
          {canEdit && <button className="btn btn-primary" disabled={busy} onClick={calculer}>{t('com.comm.compute')}</button>}
          <button className="btn btn-secondary" onClick={() => setShowBareme(s => !s)}>{t('com.comm.bareme')}</button>
        </div>
      </div>
      {msg && <div className="alert alert-success" style={{ maxWidth: 720 }}>{msg}</div>}

      {showBareme && (
        <section className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>{t('com.comm.baremeTitle')}</h2>
          <table className="table" style={{ width: '100%', maxWidth: 640 }}>
            <thead><tr><th>{t('com.comm.thBu')}</th><th style={{ textAlign: 'right' }}>{t('com.comm.thCaMin')}</th><th style={{ textAlign: 'right' }}>{t('com.comm.thTaux')}</th><th>{t('com.comm.thActif')}</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {bareme.map(row => (
                <tr key={row.id}>
                  <td>{row.business_unit_nom || t('com.comm.global')}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(row.palier_min)}</td>
                  <td style={{ textAlign: 'right' }}>{(Number(row.taux) * 100).toLocaleString('fr-FR')} %</td>
                  <td>{row.actif ? t('com.comm.yes') : t('com.comm.no')}</td>
                  {canEdit && <td><button className="btn btn-danger btn-sm" onClick={() => delTier(row.id)}>{t('com.comm.delete')}</button></td>}
                </tr>
              ))}
              {bareme.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--color-text-muted)', padding: 12 }}>{t('com.comm.noTier')}</td></tr>}
            </tbody>
          </table>
          {canEdit && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
              <label className="field" style={{ maxWidth: 200 }}>{t('com.comm.buVideGlobal')}
                <select value={newTier.business_unit_id} onChange={e => setNewTier(nt => ({ ...nt, business_unit_id: e.target.value }))}>
                  <option value="">{t('com.comm.global')}</option>
                  {bus.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                </select>
              </label>
              <label className="field" style={{ maxWidth: 180 }}>{t('com.comm.caMin')}
                <input type="number" min="0" step="1000000" value={newTier.palier_min} onChange={e => setNewTier(nt => ({ ...nt, palier_min: e.target.value }))} />
              </label>
              <label className="field" style={{ maxWidth: 120 }}>{t('com.comm.taux')}
                <input type="number" min="0" step="0.1" value={newTier.taux} onChange={e => setNewTier(nt => ({ ...nt, taux: e.target.value }))} />
              </label>
              <button className="btn btn-primary btn-sm" onClick={addTier}>{t('com.comm.addTier')}</button>
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('com.comm.baremeHint')}</p>
        </section>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px' }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>{t('com.comm.monthTitle')}</h2>
        <ExportButtons filename={`commissions_${mois}`} columns={exportCols} rows={exportRows} />
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr><th>{t('com.comm.thCommercial')}</th><th>{t('com.comm.thBu')}</th><th style={{ textAlign: 'right' }}>{t('com.comm.thBase')}</th><th style={{ textAlign: 'right' }}>{t('com.comm.thTaux')}</th><th style={{ textAlign: 'right' }}>{t('com.comm.thCommission')}</th><th>{t('com.comm.thStatut')}</th>{canEdit && <th />}</tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><Link to={`/commerce/commerciaux/${r.commercial_id}`}>{r.commercial_code} — {r.commercial_prenom || ''} {r.commercial_nom || ''}</Link></td>
                <td>{r.business_unit_nom || '—'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.base_montant)}</td>
                <td style={{ textAlign: 'right' }}>{(Number(r.taux) * 100).toLocaleString('fr-FR')} %</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(r.montant)}</td>
                <td><span className="badge" style={{ background: STATUT_COLOR[r.statut], color: '#fff' }}>{statutLabel(r.statut)}</span></td>
                {canEdit && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.statut === 'calculee' && <button className="btn btn-primary btn-sm" style={{ marginRight: 6 }} onClick={() => act(r.id, 'validate')}>{t('com.comm.validate')}</button>}
                    {r.statut === 'validee' && <button className="btn btn-primary btn-sm" style={{ marginRight: 6 }} onClick={() => act(r.id, 'pay')}>{t('com.comm.markPaid')}</button>}
                    {['calculee', 'validee'].includes(r.statut) && <button className="btn btn-danger btn-sm" onClick={() => { const m = window.prompt(t('com.comm.cancelPrompt')); if (m !== null) act(r.id, 'cancel', { motif: m }); }}>{t('com.comm.cancel')}</button>}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 20 }}>{t('com.comm.empty')}</td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr><td colSpan={4} style={{ fontWeight: 700 }}>{t('com.comm.totalCommissions')}</td><td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(total)}</td><td colSpan={canEdit ? 2 : 1} /></tr></tfoot>}
        </table>
      </div>
    </div>
  );
}
