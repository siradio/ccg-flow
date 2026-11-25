import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import portal, { recrToken } from './portalClient';

// Portail EXTERNE du candidat : connexion (identifiant + mot de passe), présentation du test, passage
// avec chronomètre contrôlé côté serveur, sauvegarde automatique et soumission. Aucune navigation
// interne CCG Flow n'est accessible ici. Rendu hors <Layout>.

const STYLE = `
.rp-wrap{min-height:100vh;background:#f3f5f8;color:#15202b;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.rp-head{background:#0b3d64;color:#fff;padding:14px 18px}
.rp-head strong{font-size:12px;letter-spacing:.08em;opacity:.85}
.rp-head h1{margin:2px 0 0;font-size:18px}
.rp-main{max-width:860px;margin:0 auto;padding:18px 16px 60px}
.rp-card{background:#fff;border:1px solid #e3e8ef;border-radius:14px;padding:20px;box-shadow:0 2px 10px rgba(16,40,70,.05);margin-bottom:16px}
.rp-field{display:flex;flex-direction:column;gap:4px;margin-bottom:12px;font-size:14px}
.rp-field input{padding:10px 12px;border:1px solid #cfd8e3;border-radius:8px;font-size:15px}
.rp-btn{background:#0b6bcb;color:#fff;border:none;border-radius:8px;padding:11px 18px;font-size:15px;font-weight:600;cursor:pointer}
.rp-btn:disabled{opacity:.5;cursor:default}
.rp-btn.sec{background:#fff;color:#0b3d64;border:1px solid #cfd8e3}
.rp-err{background:#fde8e8;color:#8a1c1c;border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:12px}
.rp-status{position:sticky;top:0;z-index:5;background:#fff;border:1px solid #e3e8ef;border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.rp-clock{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.rp-clock.warn{color:#b45309}.rp-clock.crit{color:#b42318}
.rp-grid{display:flex;flex-wrap:wrap;gap:6px}
.rp-gbtn{width:34px;height:34px;border-radius:8px;border:1px solid #cfd8e3;background:#fff;cursor:pointer;font-size:13px}
.rp-gbtn.ans{background:#dcfce7;border-color:#86efac}.rp-gbtn.rev{background:#fef3c7;border-color:#fcd34d}.rp-gbtn.cur{outline:2px solid #0b6bcb}
.rp-q legend{font-weight:600;font-size:16px;margin-bottom:10px}
.rp-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #e3e8ef;border-radius:8px;margin-bottom:8px;cursor:pointer}
.rp-opt:hover{border-color:#0b6bcb}
.rp-bar{height:8px;background:#e3e8ef;border-radius:4px;overflow:hidden;flex:1;min-width:120px}
.rp-bar>i{display:block;height:100%;background:#16a34a}
@media(max-width:560px){.rp-main{padding:12px}}
`;

function fmt(sec) { const s = Math.max(0, sec); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function isAnswered(v) { if (!v) return false; if (Array.isArray(v.selected)) return v.selected.length > 0; if (v.text != null) return String(v.text).trim() !== ''; if (v.number != null) return String(v.number).trim() !== ''; return false; }

export default function PortailCandidat() {
  const { token } = useParams();
  const [phase, setPhase] = useState('loading'); // loading|login|intro|exam|done
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);

  const loadSession = useCallback(async () => {
    const s = (await portal.get('/public/recrutement/session')).data;
    setSession(s);
    if (s.etat === 'en_cours') setPhase('exam');
    else if (s.etat === 'soumis' || s.etat === 'expire') setPhase('done');
    else setPhase('intro');
  }, []);

  useEffect(() => {
    if (recrToken.get()) loadSession().catch(() => { recrToken.clear(); setPhase('login'); });
    else setPhase('login');
  }, [loadSession]);

  if (phase === 'loading') return <Shell><div className="rp-card">Chargement…</div></Shell>;
  if (phase === 'login') return <Shell><LoginForm token={token} error={error} setError={setError} onLogged={() => loadSession().catch(e => setError(e.response?.data?.error || 'Erreur.'))} /></Shell>;
  if (phase === 'intro') return <Shell><Intro session={session} onStart={() => setPhase('exam')} setError={setError} error={error} /></Shell>;
  if (phase === 'exam') return <Shell><Exam onDone={() => loadSession().catch(() => setPhase('done'))} /></Shell>;
  return <Shell><Done session={session} /></Shell>;
}

function Shell({ children }) {
  return (
    <div className="rp-wrap">
      <style>{STYLE}</style>
      <div className="rp-head"><strong>CCG GROUPE · RECRUTEMENT</strong><h1>Test de recrutement</h1></div>
      <div className="rp-main">{children}</div>
    </div>
  );
}

function LoginForm({ token, error, setError, onLogged }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await portal.post('/public/recrutement/login', { token, login: login.trim(), password });
      recrToken.set(r.data.token);
      await onLogged();
    } catch (err) { setError(err.response?.data?.error || 'Connexion impossible.'); setBusy(false); }
  }
  return (
    <div className="rp-card" style={{ maxWidth: 420, margin: '20px auto' }}>
      <h2 style={{ marginTop: 0 }}>Connexion au test</h2>
      {error && <div className="rp-err">{error}</div>}
      <form onSubmit={submit}>
        <label className="rp-field">Identifiant<input value={login} onChange={e => setLogin(e.target.value)} autoComplete="off" required /></label>
        <label className="rp-field">Mot de passe
          <span style={{ display: 'flex', gap: 8 }}>
            <input style={{ flex: 1 }} type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="rp-btn sec" onClick={() => setShow(s => !s)}>{show ? 'Masquer' : 'Afficher'}</button>
          </span>
        </label>
        <button className="rp-btn" disabled={busy} style={{ width: '100%', marginTop: 6 }}>{busy ? '…' : 'Se connecter'}</button>
      </form>
      <p style={{ fontSize: 13, color: '#5b6b7b', marginBottom: 0 }}>En cas de difficulté, contactez le service Ressources humaines de CCG Groupe.</p>
    </div>
  );
}

function Intro({ session, onStart, error, setError }) {
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = session.test || {};
  async function start() {
    setBusy(true); setError('');
    try { await portal.post('/public/recrutement/start'); onStart(); }
    catch (err) { setError(err.response?.data?.error || 'Impossible de démarrer.'); setBusy(false); }
  }
  const row = (k, v) => v ? <p style={{ margin: '4px 0' }}><strong>{k} :</strong> {v}</p> : null;
  return (
    <div className="rp-card">
      <h2 style={{ marginTop: 0 }}>{t.titre || 'Test de recrutement'}</h2>
      {error && <div className="rp-err">{error}</div>}
      {row('Candidat', `${session.candidat?.prenom || ''} ${session.candidat?.nom || ''}`)}
      {row('Poste', session.poste)}
      {row('Société', session.societe)}
      {row('Nombre de questions', t.nb_questions)}
      {row('Durée', t.duree_min ? `${t.duree_min} minutes` : null)}
      {row('Date limite', session.date_limite ? new Date(session.date_limite).toLocaleString('fr-FR') : null)}
      {t.consignes && <div style={{ background: '#f3f5f8', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', margin: '10px 0' }}>{t.consignes}</div>}
      <p style={{ fontSize: 13, color: '#5b6b7b' }}>Vos réponses sont confidentielles et transmises au service Ressources humaines. Le chronomètre démarre dès que vous cliquez sur « Commencer » et ne pourra pas être réinitialisé.</p>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
        <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> J'ai lu et compris les consignes.
      </label>
      <button className="rp-btn" disabled={!ack || busy} onClick={start}>{busy ? '…' : 'Commencer le test'}</button>
    </div>
  );
}

function Exam({ onDone }) {
  const [data, setData] = useState(null);
  const [ans, setAns] = useState({});
  const [cur, setCur] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const deadlineRef = useRef(null);
  const warnedRef = useRef({});

  const applyData = useCallback((d) => {
    setData(d);
    const a = {}; for (const [k, v] of Object.entries(d.answers || {})) a[k] = v.value || {};
    setAns(a);
    deadlineRef.current = Date.now() + (d.remaining_sec || 0) * 1000;
    setRemaining(d.remaining_sec || 0);
  }, []);

  useEffect(() => { portal.get('/public/recrutement/attempt').then(r => applyData(r.data)).catch(e => setError(e.response?.data?.error || 'Erreur.')); }, [applyData]);

  // Chronomètre local (affichage) borné par le serveur ; soumission auto à 0.
  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
      for (const th of [600, 300, 60]) { if (left <= th && !warnedRef.current[th]) { warnedRef.current[th] = true; setFlash(`Il reste ${Math.round(th / 60)} minute(s).`); setTimeout(() => setFlash(''), 4000); } }
      if (left <= 0) { clearInterval(id); autoSubmit(); }
    }, 1000);
    return () => clearInterval(id);
  }, [data]); // eslint-disable-line

  // Re-synchronisation serveur (dérive + détection d'expiration/soumission) toutes les 30 s.
  useEffect(() => {
    if (!data) return;
    const id = setInterval(async () => {
      try {
        const d = (await portal.get('/public/recrutement/attempt')).data;
        if (d.statut !== 'en_cours') { clearInterval(id); onDone(); return; }
        deadlineRef.current = Date.now() + (d.remaining_sec || 0) * 1000;
      } catch { /* réseau : on garde l'état local */ }
    }, 30000);
    return () => clearInterval(id);
  }, [data]); // eslint-disable-line

  async function autoSubmit() { try { await portal.post('/public/recrutement/submit'); } catch { /* ignore */ } onDone(); }

  async function save(q, value, review) {
    setAns(a => ({ ...a, [q.id]: value }));
    try { await portal.post('/public/recrutement/answer', { attempt_question_id: q.id, value, marque_a_revoir: !!review }); }
    catch (e) { if (e.response?.status === 409) { onDone(); } }
  }

  if (error) return <div className="rp-err">{error}</div>;
  if (!data) return <div className="rp-card">Chargement du test…</div>;

  const qs = data.questions || [];
  const q = qs[cur];
  const answeredCount = qs.filter(x => isAnswered(ans[x.id])).length;
  const reviewSet = new Set(Object.entries(data.answers || {}).filter(([, v]) => v.marque_a_revoir).map(([k]) => Number(k)));
  const warnClass = remaining <= 60 ? 'crit' : remaining <= 300 ? 'warn' : '';

  async function submitNow() { setConfirmOpen(false); try { await portal.post('/public/recrutement/submit'); } catch { /* idempotent */ } onDone(); }

  return (
    <div>
      {flash && <div className="rp-err" style={{ background: '#fef3c7', color: '#92400e' }}>{flash}</div>}
      <div className="rp-status">
        <span className={`rp-clock ${warnClass}`}>{fmt(remaining)}</span>
        <div className="rp-bar"><i style={{ width: `${qs.length ? (answeredCount / qs.length) * 100 : 0}%` }} /></div>
        <span style={{ fontSize: 13, color: '#5b6b7b' }}>{answeredCount} / {qs.length} répondu(es)</span>
        <button className="rp-btn" style={{ marginLeft: 'auto' }} onClick={() => setConfirmOpen(true)}>Envoyer mon test</button>
      </div>

      <div className="rp-card">
        <div className="rp-grid" style={{ marginBottom: 14 }}>
          {qs.map((x, i) => {
            const cls = ['rp-gbtn', isAnswered(ans[x.id]) ? 'ans' : '', reviewSet.has(x.id) ? 'rev' : '', i === cur ? 'cur' : ''].join(' ');
            return <button key={x.id} className={cls} onClick={() => setCur(i)}>{i + 1}</button>;
          })}
        </div>

        {q && <QuestionView q={q} index={cur} total={qs.length} value={ans[q.id]} review={reviewSet.has(q.id)}
          onChange={(v) => save(q, v, reviewSet.has(q.id))}
          onReview={(r) => save(q, ans[q.id] || {}, r)} />}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <button className="rp-btn sec" disabled={cur === 0} onClick={() => setCur(c => c - 1)}>← Précédent</button>
          <button className="rp-btn sec" disabled={cur >= qs.length - 1} onClick={() => setCur(c => c + 1)}>Suivant →</button>
        </div>
      </div>

      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }} onClick={() => setConfirmOpen(false)}>
          <div className="rp-card" style={{ maxWidth: 420, margin: 16 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Envoyer définitivement ?</h3>
            <p>{qs.length - answeredCount} question(s) sans réponse. Vous ne pourrez plus modifier vos réponses après l'envoi.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="rp-btn sec" onClick={() => setConfirmOpen(false)}>Annuler</button>
              <button className="rp-btn" onClick={submitNow}>Envoyer mon test</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionView({ q, index, total, value, review, onChange, onReview }) {
  const v = value || {};
  const selected = Array.isArray(v.selected) ? v.selected : [];
  function pickUnique(idx) { onChange({ selected: [idx] }); }
  function toggleMulti(idx) { const s = new Set(selected); s.has(idx) ? s.delete(idx) : s.add(idx); onChange({ selected: [...s].sort((a, b) => a - b) }); }

  return (
    <fieldset className="rp-q" style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend>{index + 1}. {q.intitule} <span style={{ fontWeight: 400, color: '#8a98a8', fontSize: 13 }}>({q.points} pt)</span></legend>
      {q.description && <p style={{ color: '#5b6b7b', whiteSpace: 'pre-wrap' }}>{q.description}</p>}

      {(q.type === 'qcm_unique' || q.type === 'vrai_faux') && q.options.map(o => (
        <label key={o.idx} className="rp-opt"><input type="radio" name={`q${q.id}`} checked={selected[0] === o.idx} onChange={() => pickUnique(o.idx)} /> {o.libelle}</label>
      ))}
      {q.type === 'qcm_multiple' && q.options.map(o => (
        <label key={o.idx} className="rp-opt"><input type="checkbox" checked={selected.includes(o.idx)} onChange={() => toggleMulti(o.idx)} /> {o.libelle}</label>
      ))}
      {q.type === 'numerique' && <input type="number" defaultValue={v.number ?? ''} onBlur={e => onChange({ number: e.target.value })} style={{ padding: 10, border: '1px solid #cfd8e3', borderRadius: 8, maxWidth: 240 }} />}
      {q.type === 'texte_court' && <input defaultValue={v.text ?? ''} onBlur={e => onChange({ text: e.target.value })} style={{ padding: 10, border: '1px solid #cfd8e3', borderRadius: 8, width: '100%', maxWidth: 420 }} />}
      {(q.type === 'texte_long' || q.type === 'mise_situation') && <textarea defaultValue={v.text ?? ''} onBlur={e => onChange({ text: e.target.value })} rows={5} style={{ padding: 10, border: '1px solid #cfd8e3', borderRadius: 8, width: '100%' }} />}
      {q.type === 'fichier' && <p style={{ color: '#8a98a8', fontSize: 13 }}>Le dépôt de fichier se fait auprès du service RH.</p>}

      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: 13, color: '#5b6b7b' }}>
        <input type="checkbox" checked={review} onChange={e => onReview(e.target.checked)} /> Marquer à revoir
      </label>
    </fieldset>
  );
}

function Done({ session }) {
  const r = session?.resultat;
  return (
    <div className="rp-card">
      <h2 style={{ marginTop: 0 }}>Merci d'avoir participé</h2>
      <p>Merci d'avoir participé au test de recrutement de CCG Groupe. Vos réponses ont été enregistrées et transmises au service Ressources humaines ainsi qu'au responsable du service concerné. Vous serez contacté concernant la suite du processus de recrutement.</p>
      {r && (
        <div style={{ background: '#f3f5f8', borderRadius: 8, padding: 14, marginTop: 10 }}>
          <strong>Votre résultat (partie à correction automatique) :</strong>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{r.score} / {r.max} — {r.note_sur_20}/20</div>
        </div>
      )}
      <p style={{ fontSize: 13, color: '#5b6b7b', marginTop: 14 }}>Vous pouvez fermer cette page.</p>
    </div>
  );
}
