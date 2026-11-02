import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../../api/client';
import ReferentialPage from '../Referentials/ReferentialPage';
import RhSubnav, { canManageRhTypes } from './RhSubnav';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

// Échéance & rappel de la demande de journaliers (jour, heure de rappel, heure limite de soumission).
// Stocké côté serveur (app_settings), lu par le formulaire de saisie et le planificateur de rappel.
function JournaliersConfigCard() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { client.get('/rh/journaliers/config').then(r => setCfg(r.data)).catch(() => setCfg({ jour: 5, rappel_heure: 8, deadline_heure: 13 })); }, []);
  if (!cfg) return null;

  const set = (k, v) => { setCfg(c => ({ ...c, [k]: Number(v) })); setMsg(''); };
  async function save() {
    setSaving(true); setMsg('');
    try { const r = await client.put('/rh/journaliers/config', cfg); setCfg(r.data); setMsg('Enregistré.'); }
    catch (e) { setMsg(e.response?.data?.error || 'Erreur.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Échéance & rappel — Demande de journaliers</h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>
        Jour de référence, heure du rappel automatique et heure limite de soumission au circuit.
        Après l'heure limite, la soumission est fermée jusqu'au lundi suivant (le brouillon reste possible).
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 150 }}>Jour de référence
          <select value={cfg.jour} onChange={e => set('jour', e.target.value)}>
            {JOURS.map((j, i) => <option key={i} value={i}>{j.charAt(0).toUpperCase() + j.slice(1)}</option>)}
          </select>
        </label>
        <label className="field" style={{ width: 150 }}>Heure du rappel
          <select value={cfg.rappel_heure} onChange={e => set('rappel_heure', e.target.value)}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
          </select>
        </label>
        <label className="field" style={{ width: 170 }}>Heure limite de soumission
          <select value={cfg.deadline_heure} onChange={e => set('deadline_heure', e.target.value)}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        {msg && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{msg}</span>}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
        Actuel : rappel le <strong>{JOURS[cfg.jour]} à {hh(cfg.rappel_heure)}</strong>, soumission jusqu'au <strong>{JOURS[cfg.jour]} {hh(cfg.deadline_heure)}</strong>.
        Heures basées sur l'horloge serveur (UTC ≈ Conakry).
      </p>
    </div>
  );
}

// Paramètres RH — gestion des types de demande (congé / absence / recrutement) et de leur forfait
// de jours accordés. Ces types alimentent les listes déroulantes des formulaires Absence/Congé
// (via GET /rh/types) : plus rien n'est codé en dur. Réutilise la page CRUD générique des
// référentiels sur l'endpoint /rh/admin/types (réservé RH/super_admin côté backend).
// Jours fériés — décompte des congés/absences. Gestion CRUD (page référentiel générique) + bouton
// de pré-remplissage des fériés à date fixe d'une année ; les fériés variables sont saisis à la main.
function FeriesManager() {
  const cy = new Date().getFullYear();
  const [annee, setAnnee] = useState(cy);
  const [reloadKey, setReloadKey] = useState(0);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const feriesFields = [
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'libelle', label: 'Libellé', required: true },
  ];
  const years = []; for (let y = cy - 1; y <= cy + 2; y++) years.push(y);
  async function prefill() {
    setBusy(true); setMsg('');
    try { const r = await client.post('/rh/admin/feries/prefill', { annee }); setMsg(`${r.data.inserted} férié(s) fixe(s) ajouté(s) pour ${r.data.annee}.`); setReloadKey(k => k + 1); }
    catch (e) { setMsg(e.response?.data?.error || 'Erreur.'); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ marginTop: 28 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Jours fériés — décompte des congés</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>
          Ces dates sont déduites du décompte des congés et absences (en plus des dimanches). Pré-remplissez
          les fériés à date fixe d'une année, puis ajoutez ou corrigez les dates variables (Tabaski, Aïd, Maouloud, Pâques…).
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 120 }}>Année
            <select value={annee} onChange={e => setAnnee(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" disabled={busy} onClick={prefill}>{busy ? '…' : `Pré-remplir les fériés fixes ${annee}`}</button>
          {msg && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{msg}</span>}
        </div>
      </div>
      <ReferentialPage
        key={`feries-${reloadKey}`} title="Jours fériés" endpoint="/rh/admin/feries"
        fields={feriesFields} filters={[]} lists={{}} canAdd canEdit
      />
    </div>
  );
}

export default function RhParametres() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (!canManageRhTypes(user)) return <Navigate to="/rh/mes-demandes" replace />;

  const fields = [
    { key: 'domaine', label: t('rh.param.domaine'), type: 'select', required: true, options: ['conge', 'absence', 'recrutement'],
      optionLabels: { conge: t('rh.param.dom.conge'), absence: t('rh.param.dom.absence'), recrutement: t('rh.param.dom.recrutement') } },
    { key: 'libelle', label: t('rh.param.libelle'), required: true },
    { key: 'code', label: t('rh.param.code'), required: true },
    { key: 'jours_accordes', label: t('rh.param.jours'), type: 'number' },
    { key: 'imputable_solde', label: t('rh.param.imputable'), type: 'checkbox' },
    { key: 'justificatif_requis', label: t('rh.param.justif'), type: 'checkbox' },
    { key: 'ordre', label: t('rh.param.ordre'), type: 'number' },
    { key: 'actif', label: t('rh.param.actif'), type: 'checkbox', default: true },
  ];

  // Types de tâches journalières (demande de journaliers) — configurables par les RH.
  const taskFields = [
    { key: 'nom', label: 'Nom de la tâche', required: true },
    { key: 'ordre', label: 'Ordre', type: 'number' },
    { key: 'actif', label: 'Actif', type: 'checkbox', default: true },
  ];

  return (
    <div>
      <RhSubnav />
      <ReferentialPage
        key="rh-types" title={t('rh.param.title')} endpoint="/rh/admin/types"
        fields={fields} filters={['domaine', 'actif']} lists={{}} canAdd canEdit
      />
      <div style={{ marginTop: 28 }}>
        <JournaliersConfigCard />
        <ReferentialPage
          key="rh-task-types" title="Types de tâches journalières" endpoint="/rh/journaliers/task-types"
          fields={taskFields} filters={['actif']} lists={{}} canAdd canEdit
        />
      </div>
      <FeriesManager />
    </div>
  );
}
