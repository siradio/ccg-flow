import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import client from '../../../api/client';
import { useConfirm } from '../../../components/ConfirmProvider.jsx';
import { ROLE_CODES, GLOBAL_ROLES, NIVEAUX, userStatus, STATUS_META, StatusBadge } from './shared.jsx';

export default function DetailPage() {
  const confirm = useConfirm();
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const [u, setU] = useState(null);
  const [entities, setEntities] = useState([]);
  const [moduleCatalog, setModuleCatalog] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');
  const [sendingId, setSendingId] = useState(null); // vaut u.id pendant une action asynchrone en cours
  const [roleForm, setRoleForm] = useState({});
  const [buForm, setBuForm] = useState('');
  const [quick, setQuick] = useState({ copyFrom: '', profileId: '', saveOpen: false, saveName: '', saveDesc: '' });
  const [editOpen, setEditOpen] = useState(searchParams.get('edit') === '1');
  const [editForm, setEditForm] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ password: '', notify: true });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [otherUsers, setOtherUsers] = useState([]); // pour "copier les accès de…"

  function load() {
    return client.get(`/users/${id}`).then(res => {
      setU(res.data);
      setEditForm(f => f || { nom: res.data.nom, prenom: res.data.prenom, email: res.data.email, telephone: res.data.telephone || '', fonction: res.data.fonction || '' });
    });
  }
  useEffect(() => {
    load();
    client.get('/entities').then(res => setEntities(res.data));
    client.get('/users/sub-module-catalog').then(res => setModuleCatalog(res.data));
    client.get('/business-units').then(res => setBusinessUnits(res.data));
    client.get('/access-profiles').then(res => setProfiles(res.data));
    client.get('/users').then(res => setOtherUsers(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!u) return <p>Chargement…</p>;

  async function addRole() {
    const rf = roleForm;
    if (!rf.role_code) return;
    const isGlobal = GLOBAL_ROLES.includes(rf.role_code);
    if (!isGlobal && !rf.entity_id) return;
    const entity_id = isGlobal ? null : (rf.entity_id === 'all' ? 'all' : Number(rf.entity_id));
    await client.post(`/users/${u.id}/roles`, { entity_id, role_code: rf.role_code });
    setRoleForm({});
    load();
  }

  async function removeRole(roleId) {
    await client.delete(`/users/${u.id}/roles/${roleId}`);
    load();
  }

  async function setSubModuleNiveau(subModuleKey, niveau) {
    if (niveau) await client.put(`/users/${u.id}/sub-modules/${subModuleKey}`, { niveau });
    else await client.delete(`/users/${u.id}/sub-modules/${subModuleKey}`);
    load();
  }

  async function addBusinessUnit() {
    if (!buForm) return;
    await client.post(`/users/${u.id}/business-units`, { business_unit_id: buForm === 'all' ? 'all' : Number(buForm) });
    setBuForm('');
    load();
  }

  async function removeBusinessUnit(accessId) {
    await client.delete(`/users/${u.id}/business-units/${accessId}`);
    load();
  }

  async function toggleActive() {
    const action = u.actif ? 'désactiver' : 'réactiver';
    if (!(await confirm(`Confirmer : ${action} ${u.prenom} ${u.nom} ?`, { danger: u.actif, confirmLabel: u.actif ? 'Supprimer' : 'Réactiver' }))) return;
    setError(''); setNotice(null);
    try {
      await client.put(`/users/${u.id}`, { actif: !u.actif });
      setNotice({ type: 'success', text: `${u.prenom} ${u.nom} ${u.actif ? 'désactivé' : 'réactivé'}.` });
      load();
    } catch (err) { setError(err.response?.data?.error || `Impossible de ${action} cet utilisateur.`); }
  }

  async function approveAccess() {
    if (!(await confirm(`Valider l'accès de ${u.prenom} ${u.nom} ? Un mot de passe lui sera généré et envoyé par email à ${u.email}.`, { confirmLabel: 'Valider' }))) return;
    setError(''); setNotice(null); setSendingId(u.id);
    try {
      const { data } = await client.post(`/users/${u.id}/approve-access`);
      if (data.notification?.sent) setNotice({ type: 'success', text: `Accès validé. Identifiants envoyés par email à ${u.email}.` });
      else setNotice({ type: 'warning', text: `Accès validé, mais l'email n'a pas pu être envoyé. Mot de passe généré : ${data.generatedPassword} — à communiquer manuellement.` });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Échec de la validation.'); }
    finally { setSendingId(null); }
  }

  async function rejectAccess() {
    setError(''); setNotice(null); setSendingId(u.id);
    try {
      await client.post(`/users/${u.id}/reject-access`, { note: rejectNote });
      setNotice({ type: 'success', text: `Demande de ${u.email} rejetée${rejectNote.trim() ? ' (motif envoyé par email)' : ''}.` });
      setRejectOpen(false); setRejectNote('');
      load();
    } catch (err) { setError(err.response?.data?.error || 'Échec du rejet.'); }
    finally { setSendingId(null); }
  }

  async function saveEdit() {
    setError(''); setNotice(null); setSendingId(u.id);
    try {
      await client.put(`/users/${u.id}`, editForm);
      setEditOpen(false);
      setNotice({ type: 'success', text: 'Informations mises à jour.' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Échec de la mise à jour.'); }
    finally { setSendingId(null); }
  }

  async function applyPassword() {
    setError(''); setNotice(null); setSendingId(u.id);
    try {
      const { data } = await client.post(`/users/${u.id}/set-password`, { password: pw.password, notify: pw.notify });
      const gen = data.generatedPassword;
      if (pw.notify && data.notification?.sent) {
        setNotice({ type: 'success', text: `Mot de passe mis à jour et envoyé par email à ${u.email}.` });
      } else if (pw.notify && !data.notification?.sent) {
        setNotice({ type: 'warning', text: `Mot de passe mis à jour, mais l'email n'a pas pu être envoyé${data.notification?.error ? ` (${data.notification.error})` : ''}.${gen ? ` Mot de passe généré : ${gen} — à communiquer manuellement.` : ''}` });
      } else {
        setNotice({ type: 'success', text: `Mot de passe mis à jour pour ${u.email}.${gen ? ` Mot de passe généré : ${gen} — à lui communiquer.` : ''}` });
      }
      setPwOpen(false);
      setPw({ password: '', notify: true });
    } catch (err) { setError(err.response?.data?.error || 'Erreur lors de la mise à jour du mot de passe.'); }
    finally { setSendingId(null); }
  }

  // « Renvoyer les identifiants » en un clic : régénère un mot de passe fort et l'envoie par email
  // (les mots de passe étant hachés, on ne peut pas renvoyer l'ancien — on en émet un nouveau). Si
  // l'email échoue, le mot de passe généré est affiché pour communication manuelle.
  async function resendCredentials() {
    const ok = await confirm(
      `Renvoyer les identifiants à ${u.prenom} ${u.nom} (${u.email}) ? Un nouveau mot de passe sera généré et envoyé par email — l'ancien ne fonctionnera plus.`,
      { confirmLabel: 'Renvoyer' }
    );
    if (!ok) return;
    setError(''); setNotice(null); setSendingId(u.id);
    try {
      const { data } = await client.post(`/users/${u.id}/set-password`, { notify: true });
      const gen = data.generatedPassword;
      if (data.notification?.sent) {
        setNotice({ type: 'success', text: `Identifiants renvoyés par email à ${u.email}.` });
      } else {
        setNotice({ type: 'warning', text: `Nouveau mot de passe généré, mais l'email n'a pas pu être envoyé${data.notification?.error ? ` (${data.notification.error})` : ''}.${gen ? ` Mot de passe : ${gen} — à lui communiquer manuellement.` : ''}` });
      }
    } catch (err) { setError(err.response?.data?.error || 'Erreur lors de l’envoi des identifiants.'); }
    finally { setSendingId(null); }
  }

  async function copyAccessFrom() {
    if (!quick.copyFrom) return;
    setError(''); setNotice(null);
    try {
      await client.post(`/users/${u.id}/copy-access-from`, { sourceUserId: Number(quick.copyFrom) });
      setQuick(q => ({ ...q, copyFrom: '' }));
      setNotice({ type: 'success', text: 'Accès copiés depuis le compte source.' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Échec de la copie des accès.'); }
  }

  async function applyProfile() {
    if (!quick.profileId) return;
    setError(''); setNotice(null);
    try {
      const { data } = await client.post(`/access-profiles/${quick.profileId}/apply/${u.id}`);
      const r = data.applied || {};
      setQuick(q => ({ ...q, profileId: '' }));
      setNotice({ type: 'success', text: `Profil appliqué (${r.rolesApplied || 0} rôle(s), ${r.modulesApplied || 0} module(s), ${r.busApplied || 0} BU).` });
      load();
    } catch (err) { setError(err.response?.data?.error || "Échec de l'application du profil."); }
  }

  async function saveAsProfile() {
    const nom = (quick.saveName || '').trim();
    if (!nom) return;
    setError(''); setNotice(null);
    try {
      await client.post(`/access-profiles/from-user/${u.id}`, { nom, description: (quick.saveDesc || '').trim() });
      setQuick(q => ({ ...q, saveOpen: false, saveName: '', saveDesc: '' }));
      setNotice({ type: 'success', text: `Profil « ${nom} » enregistré — applicable à tout utilisateur.` });
      client.get('/access-profiles').then(res => setProfiles(res.data));
    } catch (err) { setError(err.response?.data?.error || "Échec de l'enregistrement du profil."); }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/admin/users" className="btn btn-secondary btn-sm">← Retour à la liste</Link>
      </div>

      {notice && (
        <div className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-warning'}`}
          style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="btn-icon" aria-label="Fermer">×</button>
        </div>
      )}
      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>{u.prenom} {u.nom}</h1>
            <div style={{ marginTop: 4 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{u.email}</span>
              {' '}<StatusBadge status={userStatus(u)} />
            </div>
            {(u.fonction || u.telephone) && (
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3 }}>
                {[u.fonction, u.telephone].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {u.access_status === 'pending' ? (
              <>
                <button onClick={approveAccess} disabled={sendingId === u.id} className="btn btn-primary btn-sm">
                  {sendingId === u.id ? '…' : 'Valider l’accès'}
                </button>
                <button onClick={() => setRejectOpen(o => !o)} className="btn btn-danger-ghost btn-sm">
                  {rejectOpen ? 'Fermer' : 'Rejeter'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setPwOpen(o => !o)} className="btn btn-secondary btn-sm" title="Définir / réinitialiser le mot de passe et l’envoyer par email">
                  {pwOpen ? 'Fermer' : 'Mot de passe'}
                </button>
                <button onClick={resendCredentials} disabled={sendingId === u.id} className="btn btn-secondary btn-sm" title="Générer un nouveau mot de passe et l’envoyer par email à l’utilisateur">
                  {sendingId === u.id ? '…' : 'Renvoyer les identifiants'}
                </button>
                <button onClick={toggleActive} className={u.actif ? 'btn btn-danger-ghost btn-sm' : 'btn btn-secondary btn-sm'}>
                  {u.actif ? 'Supprimer (désactiver)' : 'Réactiver'}
                </button>
              </>
            )}
            <button onClick={() => setEditOpen(o => !o)} className="btn btn-secondary btn-sm">
              {editOpen ? 'Fermer' : 'Éditer'}
            </button>
          </div>
        </div>

        {rejectOpen && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
            <textarea placeholder="Motif du rejet (envoyé au demandeur par email)" value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: 8 }} />
            <button onClick={rejectAccess} disabled={sendingId === u.id} className="btn btn-danger btn-sm">
              {sendingId === u.id ? 'Rejet…' : 'Confirmer le rejet'}
            </button>
          </div>
        )}

        {editOpen && editForm && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
            <div className="form-inline" style={{ flexWrap: 'wrap' }}>
              <input placeholder="Prénom" value={editForm.prenom} onChange={e => setEditForm({ ...editForm, prenom: e.target.value })} />
              <input placeholder="Nom" value={editForm.nom} onChange={e => setEditForm({ ...editForm, nom: e.target.value })} />
              <input placeholder="Email" type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
              <input placeholder="Téléphone" value={editForm.telephone} onChange={e => setEditForm({ ...editForm, telephone: e.target.value })} />
              <input placeholder="Fonction" value={editForm.fonction} onChange={e => setEditForm({ ...editForm, fonction: e.target.value })} />
              <button onClick={saveEdit} disabled={sendingId === u.id} className="btn btn-primary btn-sm">Enregistrer</button>
            </div>
          </div>
        )}

        {pwOpen && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
            <div className="form-inline" style={{ flexWrap: 'wrap' }}>
              <input type="text" placeholder="Nouveau mot de passe (vide = généré)" value={pw.password}
                onChange={e => setPw({ ...pw, password: e.target.value })} style={{ minWidth: 260 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={pw.notify} onChange={e => setPw({ ...pw, notify: e.target.checked })} />
                Envoyer par email
              </label>
              <button onClick={applyPassword} disabled={sendingId === u.id} className="btn btn-primary btn-sm">
                {sendingId === u.id ? 'Application…' : 'Appliquer'}
              </button>
            </div>
            <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
              Définit un nouveau mot de passe pour {u.prenom} {u.nom} (l'actuel sera remplacé). Laissez le champ vide pour en générer un automatiquement. Décochez « Envoyer par email » pour le communiquer vous-même.
            </p>
          </div>
        )}
      </div>

      {u.access_status !== 'pending' && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            Attribution rapide
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="form-inline">
              <select value={quick.copyFrom} onChange={e => setQuick(q => ({ ...q, copyFrom: e.target.value }))}>
                <option value="">Copier les accès de…</option>
                {otherUsers.filter(x => x.id !== u.id && x.access_status !== 'pending').map(x => (
                  <option key={x.id} value={x.id}>{x.prenom} {x.nom} — {x.email}</option>
                ))}
              </select>
              <button onClick={copyAccessFrom} className="btn btn-secondary btn-sm" disabled={!quick.copyFrom}>Copier</button>
            </div>
            {profiles.length > 0 && (
              <div className="form-inline">
                <select value={quick.profileId} onChange={e => setQuick(q => ({ ...q, profileId: e.target.value }))}>
                  <option value="">Appliquer un profil…</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
                <button onClick={applyProfile} className="btn btn-secondary btn-sm" disabled={!quick.profileId}>Appliquer</button>
              </div>
            )}
            <button onClick={() => setQuick(q => ({ ...q, saveOpen: !q.saveOpen }))} className="btn btn-secondary btn-sm">
              {quick.saveOpen ? 'Annuler' : 'Enregistrer comme profil'}
            </button>
          </div>
          {quick.saveOpen && (
            <div className="form-inline" style={{ marginTop: 8 }}>
              <input placeholder="Nom du profil (ex. Responsable Achat SOGUIPAL)" value={quick.saveName}
                onChange={e => setQuick(q => ({ ...q, saveName: e.target.value }))} style={{ minWidth: 260 }} />
              <input placeholder="Description (optionnel)" value={quick.saveDesc}
                onChange={e => setQuick(q => ({ ...q, saveDesc: e.target.value }))} style={{ minWidth: 200 }} />
              <button onClick={saveAsProfile} className="btn btn-primary btn-sm" disabled={!(quick.saveName || '').trim()}>Enregistrer le profil</button>
            </div>
          )}
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--color-text-faint)' }}>
            Copier ou appliquer un profil <b>s'ajoute</b> aux accès existants (rien n'est retiré).
          </p>
        </div>
      )}

      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Rôles workflow achat</div>
        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {u.roles.map(r => (
            <span key={r.id} className="badge" style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>
              {r.role_code}{r.entity_code ? ` (${r.entity_code})` : ''}
              {' '}<button onClick={() => removeRole(r.id)} className="btn-icon">×</button>
            </span>
          ))}
          {u.roles.length === 0 && <span className="empty-row">Aucun rôle.</span>}
        </div>
        <div className="form-inline" style={{ marginTop: 10 }}>
          <select value={roleForm.role_code || ''} onChange={e => setRoleForm({ ...roleForm, role_code: e.target.value })}>
            <option value="">Rôle…</option>
            {ROLE_CODES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {roleForm.role_code && !GLOBAL_ROLES.includes(roleForm.role_code) && (
            <select value={roleForm.entity_id || ''} onChange={e => setRoleForm({ ...roleForm, entity_id: e.target.value })}>
              <option value="">Entité…</option>
              <option value="all">Toutes les entités</option>
              {entities.map(en => <option key={en.id} value={en.id}>{en.nom}</option>)}
            </select>
          )}
          <button onClick={addRole} className="btn btn-primary btn-sm">+ Ajouter le rôle</button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
          Accès aux modules
        </div>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {moduleCatalog.map(mod => (
            <ModuleAccessGroup key={mod.key} mod={mod} user={u} onChange={(key, niveau) => setSubModuleNiveau(key, niveau)} />
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Accès Business Units (Stock du Jour / Mouvement Stock)</div>
        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {u.businessUnits.map(b => (
            <span key={b.id} className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-fg)' }}>
              {b.business_unit_nom}
              {' '}<button onClick={() => removeBusinessUnit(b.id)} className="btn-icon">×</button>
            </span>
          ))}
          {u.businessUnits.length === 0 && <span className="empty-row">Aucune BU accordée (lecture seule sur toutes si un sous-module Stock est accordé).</span>}
        </div>
        <div className="form-inline" style={{ marginTop: 10 }}>
          <select value={buForm} onChange={e => setBuForm(e.target.value)}>
            <option value="">Business Unit…</option>
            <option value="all">Toutes les BU</option>
            {businessUnits.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
          <button onClick={addBusinessUnit} className="btn btn-primary btn-sm">+ Accorder la BU</button>
        </div>
      </div>
    </div>
  );
}

// Un module = un bloc ; ses sous-modules (ou lui-même s'il n'en a pas — voir modules.js §2.3)
// sont chacun une ligne avec leur propre sélecteur de niveau.
function ModuleAccessGroup({ mod, user, onChange }) {
  const rows = mod.subModules.length ? mod.subModules : [{ key: mod.key, label: mod.label }];
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: rows.length > 1 || rows[0].key !== mod.key ? 6 : 0 }}>
        {mod.label}
      </div>
      {rows.map(row => {
        const current = user.subModules.find(s => s.sub_module_key === row.key)?.niveau || '';
        return (
          <div key={row.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '3px 0', paddingLeft: mod.subModules.length ? 12 : 0 }}>
            <span style={{ fontSize: 13, color: mod.subModules.length ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
              {mod.subModules.length ? row.label : null}
            </span>
            <select value={current} onChange={e => onChange(row.key, e.target.value)} style={{ fontSize: 12 }}>
              {NIVEAUX.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}
