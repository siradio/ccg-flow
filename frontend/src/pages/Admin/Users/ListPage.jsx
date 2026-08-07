import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../../api/client';
import { useConfirm } from '../../../components/ConfirmProvider.jsx';
import { useI18n } from '../../../i18n/I18nContext';
import { ROLE_CODES, userStatus, STATUS_META, StatusBadge } from './shared.jsx';

const PAGE_SIZE = 20;

export default function ListPage() {
  const confirm = useConfirm();
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [moduleCatalog, setModuleCatalog] = useState([]);
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', password: '', notify: true });
  const [notice, setNotice] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [profiles, setProfiles] = useState([]); // profils d'accès réutilisables
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState({ active: true, inactive: true, pending: true, rejected: true });
  const [rejectPanel, setRejectPanel] = useState({}); // { [userId]: note } — panneau de rejet ouvert (ligne dépliée)
  const [page, setPage] = useState(1);

  // key de sous-module -> libellé lisible, pour la colonne "Module" (un module sans sous-modules
  // EST lui-même l'unité accordable — voir backend/src/config/modules.js).
  const moduleLabelByKey = useMemo(() => {
    const map = {};
    for (const mod of moduleCatalog) {
      if (mod.subModules.length) mod.subModules.forEach(sm => { map[sm.key] = sm.label; });
      else map[mod.key] = mod.label;
    }
    return map;
  }, [moduleCatalog]);

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search || `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(search.toLowerCase());
    const matchesRole = !roleFilter || u.roles.some(r => r.role_code === roleFilter);
    const matchesStatus = statusFilter[userStatus(u)];
    return matchesSearch && matchesRole && matchesStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Un filtre plus restrictif peut faire disparaître la page courante (ex. page 3 sur un filtre qui
  // ne laisse qu'une page) — on revient sur la dernière page valide plutôt que d'afficher un tableau vide.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  // Changer un filtre repart de la page 1 — sinon on peut se retrouver sur une page 3 devenue
  // incohérente avec les nouveaux résultats filtrés.
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  function load() { client.get('/users').then(res => setUsers(res.data)); }
  function loadProfiles() { client.get('/access-profiles').then(res => setProfiles(res.data)); }
  useEffect(() => {
    load();
    loadProfiles();
    client.get('/users/sub-module-catalog').then(res => setModuleCatalog(res.data));
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setError('');
    setNotice(null);
    try {
      const payload = { ...form, copyFromUserId: form.copyFromUserId ? Number(form.copyFromUserId) : undefined };
      const { data } = await client.post('/users', payload);
      // Application d'un profil juste après la création (option du formulaire) — additif au compte créé.
      if (form.applyProfileId && data?.id) {
        try { await client.post(`/access-profiles/${form.applyProfileId}/apply/${data.id}`); } catch { /* non bloquant : le compte est créé */ }
      }
      const who = `${form.prenom} ${form.nom} (${form.email})`;
      if (form.notify && data.notification?.sent) {
        setNotice({ type: 'success', text: t('adm.users.msg.createdEmailSent', { email: form.email }) });
      } else if (form.notify && !data.notification?.sent) {
        const pw = data.generatedPassword ? t('adm.users.msg.pwGen', { pw: data.generatedPassword }) : t('adm.users.msg.pwManual');
        const errPart = data.notification?.error ? ` (${data.notification.error})` : '';
        setNotice({ type: 'warning', text: t('adm.users.msg.createdEmailFailed', { err: errPart, pw }) });
      } else if (data.generatedPassword) {
        setNotice({ type: 'success', text: t('adm.users.msg.createdWithPw', { who, pw: data.generatedPassword }) });
      } else {
        setNotice({ type: 'success', text: t('adm.users.msg.created', { who }) });
      }
      setForm({ nom: '', prenom: '', email: '', password: '', notify: true });
      setShowCreateForm(false);
      load();
    } catch (err) { setError(err.response?.data?.error || t('ref.error')); }
  }

  async function deleteProfile(id, nom) {
    if (!(await confirm(t('adm.users.confirmDeactivateProfile', { nom }), { danger: true, confirmLabel: t('adm.users.deactivate') }))) return;
    setError(''); setNotice(null);
    try {
      await client.delete(`/access-profiles/${id}`);
      loadProfiles();
    } catch (err) { setError(err.response?.data?.error || t('adm.users.err.deleteProfile')); }
  }

  // --- Demandes d'accès (statut "à valider") -------------------------------------------------
  async function approveAccess(u) {
    if (!(await confirm(t('adm.users.confirmApprove', { name: `${u.prenom} ${u.nom}`, email: u.email }), { confirmLabel: t('adm.users.approve') }))) return;
    setError(''); setNotice(null); setSendingId(u.id);
    try {
      const { data } = await client.post(`/users/${u.id}/approve-access`);
      if (data.notification?.sent) {
        setNotice({ type: 'success', text: t('adm.users.msg.approvedEmailSent', { email: u.email }) });
      } else {
        setNotice({ type: 'warning', text: t('adm.users.msg.approvedEmailFailed', { pw: data.generatedPassword }) });
      }
      load();
    } catch (err) { setError(err.response?.data?.error || t('adm.users.err.approve')); }
    finally { setSendingId(null); }
  }

  function toggleReject(u) {
    setRejectPanel(p => (p[u.id] !== undefined ? (() => { const n = { ...p }; delete n[u.id]; return n; })() : { ...p, [u.id]: '' }));
  }
  async function rejectAccess(u) {
    const note = rejectPanel[u.id] || '';
    setError(''); setNotice(null); setSendingId(u.id);
    try {
      await client.post(`/users/${u.id}/reject-access`, { note });
      setNotice({ type: 'success', text: t('adm.users.msg.rejected', { email: u.email, suffix: note.trim() ? t('adm.users.msg.reasonEmailed') : '' }) });
      setRejectPanel(p => { const n = { ...p }; delete n[u.id]; return n; });
      load();
    } catch (err) { setError(err.response?.data?.error || t('adm.users.err.reject')); }
    finally { setSendingId(null); }
  }

  // La colonne Action "Supprimer" désactive le compte (actif=false) : pas de suppression définitive
  // en base, la table users étant référencée par les demandes d'achat, l'audit, les mouvements de
  // stock, etc. — désactiver reste réversible ("Réactiver") et ne casse aucun historique.
  async function toggleActive(u) {
    const action = u.actif ? t('adm.users.action.deactivateOf') : t('adm.users.action.reactivateOf');
    if (!(await confirm(t('adm.users.confirmToggle', { action, name: `${u.prenom} ${u.nom}` }), { danger: u.actif, confirmLabel: u.actif ? t('adm.users.deactivate') : t('adm.users.reactivate') }))) return;
    setError('');
    setNotice(null);
    try {
      await client.put(`/users/${u.id}`, { actif: !u.actif });
      setNotice({ type: 'success', text: t('adm.users.msg.toggled', { name: `${u.prenom} ${u.nom}`, state: u.actif ? t('adm.users.state.deactivated') : t('adm.users.state.reactivated') }) });
      load();
    } catch (err) {
      const verb = u.actif ? t('adm.users.verb.deactivate') : t('adm.users.verb.reactivate');
      setError(err.response?.data?.error || t('adm.users.err.toggle', { action: verb }));
    }
  }

  function roleSummary(u) {
    if (u.roles.length === 0) return <span className="empty-row">—</span>;
    return [...new Set(u.roles.map(r => r.role_code))].map(rc => t('adm.role.' + rc)).join(', ');
  }

  function moduleSummary(u) {
    const granted = u.subModules.filter(s => s.niveau);
    if (granted.length === 0) return <span className="empty-row">—</span>;
    return granted.map(s => moduleLabelByKey[s.sub_module_key] || s.sub_module_key).join(', ');
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t('adm.users.title')}</h1>
        <button onClick={() => setShowCreateForm(o => !o)} className="btn btn-primary">
          {showCreateForm ? t('common.cancel') : t('adm.users.addUser')}
        </button>
      </div>

      {showCreateForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>{t('adm.users.newUser')}</h2>
          <form onSubmit={createUser} className="form-inline">
            <input placeholder={t('adm.users.f.nom')} required value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
            <input placeholder={t('adm.users.f.prenom')} required value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
            <input placeholder={t('adm.users.f.email')} type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input placeholder={form.notify ? t('adm.users.f.pwGenerated') : t('adm.users.f.pwOptional')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={form.notify} onChange={e => setForm({ ...form, notify: e.target.checked })} />
              {t('adm.users.notifyEmail')}
            </label>
            <select value={form.copyFromUserId || ''} onChange={e => setForm({ ...form, copyFromUserId: e.target.value })} title={t('adm.users.copyTitle')}>
              <option value="">{t('adm.users.copyFromOptional')}</option>
              {users.filter(u => u.access_status !== 'pending').map(u => (
                <option key={u.id} value={u.id}>{u.prenom} {u.nom} — {u.email}</option>
              ))}
            </select>
            {profiles.length > 0 && (
              <select value={form.applyProfileId || ''} onChange={e => setForm({ ...form, applyProfileId: e.target.value })} title={t('adm.users.applyProfileTitle')}>
                <option value="">{t('adm.users.orApplyProfile')}</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            )}
            <button type="submit" className="btn btn-primary">{t('adm.users.create')}</button>
          </form>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
            {t('adm.users.createHelp')}
          </p>
          {error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      )}

      {profiles.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <strong>{t('adm.users.profilesTitle')}</strong>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {t('adm.users.profilesHint')}
            </span>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {profiles.map(p => {
              const d = p.data || {};
              const summary = t('adm.users.profileSummary', { roles: (d.roles || []).length, modules: (d.subModules || []).length, bu: (d.businessUnits || []).length });
              return (
                <span key={p.id} className="badge" style={{ background: 'var(--color-primary-bg, var(--color-border))', color: 'var(--color-text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title={`${p.description ? p.description + ' — ' : ''}${summary}`}>
                  <strong>{p.nom}</strong>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>({summary})</span>
                  <button onClick={() => deleteProfile(p.id, p.nom)} className="btn-icon" aria-label={t('adm.users.deactivateProfileAria')}>×</button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {notice && (
        <div
          className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-warning'}`}
          style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="btn-icon" aria-label={t('adm.common.close')}>×</button>
        </div>
      )}
      {error && !showCreateForm && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="form-inline" style={{ marginBottom: 16 }}>
        <input
          placeholder={t('adm.common.searchNameEmail')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">{t('adm.users.allRoles')}</option>
          {ROLE_CODES.map(r => <option key={r} value={r}>{t('adm.role.' + r)}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {Object.entries(STATUS_META).map(([key, meta]) => {
            const count = users.filter(u => userStatus(u) === key).length;
            return (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="checkbox" checked={statusFilter[key]}
                  onChange={e => setStatusFilter(s => ({ ...s, [key]: e.target.checked }))} />
                <span className="badge" style={{ background: meta.bg, color: meta.fg }}>{t(meta.labelKey)}</span>
                <span style={{ color: 'var(--color-text-faint)' }}>{count}</span>
              </label>
            );
          })}
        </div>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('adm.users.countFiltered', { shown: filteredUsers.length, total: users.length, word: users.length > 1 ? t('adm.users.usersWord') : t('adm.users.userWord') })}
        </span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('adm.users.col.nom')}</th>
                <th>{t('adm.users.col.prenoms')}</th>
                <th>{t('adm.users.col.role')}</th>
                <th>{t('adm.users.col.profil')}</th>
                <th>{t('adm.users.col.module')}</th>
                <th>{t('adm.users.col.action')}</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map(u => (
                <UserRow key={u.id} u={u} roleSummary={roleSummary} moduleSummary={moduleSummary}
                  sendingId={sendingId} rejectPanel={rejectPanel} setRejectPanel={setRejectPanel}
                  toggleReject={toggleReject} approveAccess={approveAccess} rejectAccess={rejectAccess}
                  toggleActive={toggleActive} />
              ))}
              {filteredUsers.length === 0 && (
                <tr><td className="empty-row" colSpan={6}>{t('adm.users.noneMatch')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredUsers.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <span>{t('adm.users.totalCount', { count: filteredUsers.length, word: filteredUsers.length > 1 ? t('adm.users.usersWord') : t('adm.users.userWord') })}</span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('adm.users.prev')}</button>
              <span>{t('adm.users.pageOf', { page, total: totalPages })}</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('adm.users.next')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserRow({ u, roleSummary, moduleSummary, sendingId, rejectPanel, setRejectPanel, toggleReject, approveAccess, rejectAccess, toggleActive }) {
  const { t } = useI18n();
  const isPending = u.access_status === 'pending';
  return (
    <>
      <tr>
        <td>{u.nom}</td>
        <td>{u.prenom}</td>
        <td>{roleSummary(u)}</td>
        <td><StatusBadge status={userStatus(u)} /></td>
        <td>{moduleSummary(u)}</td>
        <td>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Link to={`/admin/users/${u.id}`} className="btn btn-secondary btn-sm">{t('adm.users.detail')}</Link>
            {isPending ? (
              <>
                <button onClick={() => approveAccess(u)} disabled={sendingId === u.id} className="btn btn-primary btn-sm">
                  {sendingId === u.id ? '…' : t('adm.users.approve')}
                </button>
                <button onClick={() => toggleReject(u)} className="btn btn-danger-ghost btn-sm">
                  {rejectPanel[u.id] !== undefined ? t('adm.common.close') : t('adm.users.reject')}
                </button>
              </>
            ) : (
              <>
                <Link to={`/admin/users/${u.id}?edit=1`} className="btn btn-secondary btn-sm">{t('common.edit')}</Link>
                <button onClick={() => toggleActive(u)} className={u.actif ? 'btn btn-danger-ghost btn-sm' : 'btn btn-secondary btn-sm'}>
                  {u.actif ? t('adm.users.deactivate') : t('adm.users.reactivate')}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {rejectPanel[u.id] !== undefined && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--color-hover)' }}>
            <textarea placeholder={t('adm.users.rejectReasonPlaceholder')} value={rejectPanel[u.id]}
              onChange={e => setRejectPanel(p => ({ ...p, [u.id]: e.target.value }))}
              style={{ display: 'block', width: '100%', marginBottom: 8 }} />
            <button onClick={() => rejectAccess(u)} disabled={sendingId === u.id} className="btn btn-danger btn-sm">
              {sendingId === u.id ? t('adm.users.rejecting') : t('adm.users.confirmReject')}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}
