import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { CCG_LOGO } from './ccgLogo';
import { CARTE_CSS, CARTE_PRINT_CSS } from './carteStyles';
import { cap, vcard, drawQR, legender } from './carteQr';
import { carteVersBlob } from './carteExport';

const KEY = 'ccg_carte_entreprise_v1';

// Icônes des lignes de la carte (téléphone, mobile, e-mail, site, adresse).
const ICONS = {
  tel: 'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.5.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .56 3.5 1 1 0 0 1-.25 1z',
  mobile: 'M17 1H7a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm-5 21a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zM17 18H7V4h10z',
  email: 'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z',
  site: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.8a15 15 0 0 0-1.3-3.4A8 8 0 0 1 18.9 8zM12 4c.8 1.1 1.4 2.5 1.8 4h-3.6c.4-1.5 1-2.9 1.8-4zM4.3 14a8 8 0 0 1 0-4h3.2a16.5 16.5 0 0 0 0 4zm.8 2h2.8c.3 1.2.8 2.4 1.3 3.4A8 8 0 0 1 5.1 16zm2.8-8H5.1a8 8 0 0 1 4.1-3.4A15 15 0 0 0 7.9 8zM12 20c-.8-1.1-1.4-2.5-1.8-4h3.6c-.4 1.5-1 2.9-1.8 4zm2.2-6H9.8a14 14 0 0 1 0-4h4.4a14 14 0 0 1 0 4zm.6 5.4c.5-1 1-2.2 1.3-3.4h2.8a8 8 0 0 1-4.1 3.4zM16.5 14a16.5 16.5 0 0 0 0-4h3.2a8 8 0 0 1 0 4z',
  adr: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z',
};

function Row({ icon, value, extraClass }) {
  if (!value) return null;
  return (
    <div className={`cg-row${extraClass ? ' ' + extraClass : ''}`}>
      <svg viewBox="0 0 24 24"><path d={ICONS[icon]} /></svg>
      <span>{value}</span>
    </div>
  );
}

export default function CarteVisite() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qrRef = useRef(null);
  const printAreaRef = useRef(null);
  const logoImgRef = useRef(null);

  // Champs « société » mémorisés sur ce poste (comme l'outil d'origine) ; infos perso pré-remplies
  // depuis le compte connecté.
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } })();
  const [f, setF] = useState({
    prenom: user?.prenom || '',
    nom: user?.nom || '',
    fonction: user?.fonction || '',
    tel: user?.telephone || '',
    mobile: '',
    email: user?.email || '',
    org: saved.org ?? 'CCG Groupe',
    site: saved.site ?? 'www.ccggroupe.com',
    adresse: saved.adresse ?? 'Sanoyah km 38 / Conakry République de Guinée',
    slogan: saved.slogan ?? "Produire · Distribuer · Construire l'avenir",
  });
  const [photo, setPhoto] = useState('');
  const [clair, setClair] = useState(!!saved.clair);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  // Logo chargé une fois pour la pastille centrale du PNG.
  useEffect(() => {
    const i = new Image();
    i.onload = () => { logoImgRef.current = i; };
    i.src = CCG_LOGO;
  }, []);

  const nomComplet = (cap(f.prenom) + ' ' + cap(f.nom)).trim();
  const affiche = nomComplet || 'Prénom Nom';

  const vcardText = useMemo(() => vcard({ ...f, prenom: cap(f.prenom), nom: cap(f.nom) }), [f]);

  // (Re)dessine le QR de la carte à chaque changement de données.
  useEffect(() => {
    try { if (qrRef.current) { drawQR(qrRef.current, vcardText, 360); setErr(''); } }
    catch (e) { setErr(String(e)); }
  }, [vcardText]);

  // Mémorise société + thème pour la prochaine carte.
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ org: f.org, site: f.site, adresse: f.adresse, slogan: f.slogan, clair })); } catch { /* ignore */ }
  }, [f.org, f.site, f.adresse, f.slogan, clair]);

  function onPhoto(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setPhoto(r.result);
    r.readAsDataURL(file);
  }

  // Téléchargement du QR en PNG (haute résolution, niveau H + logo central + légende).
  const [prep, setPrep] = useState(false);
  function dlQR() {
    setPrep(true);
    const qr = document.createElement('canvas');
    drawQR(qr, vcardText, 1200, { ec: 'H', quiet: 4, style: 'doux', logo: logoImgRef.current });
    const nom = (cap(f.prenom) + '-' + cap(f.nom)).replace(/\s+/g, '-').replace(/[^A-Za-zÀ-ÿ-]/g, '') || 'contact';
    const a = document.createElement('a');
    a.href = legender(qr, affiche).toDataURL('image/png');
    a.download = 'QR-' + nom + '.png';
    a.click();
    setPrep(false);
  }

  // Impression A4 à l'échelle réelle : on isole la carte dans une fenêtre dédiée (sinon window.print
  // imprimerait toute l'app). Le QR (canvas, non cloné) est remplacé par son image.
  function imprimer() {
    const area = printAreaRef.current;
    if (!area) return;
    const clone = area.cloneNode(true);
    const srcCanvas = area.querySelector('canvas');
    const cloneCanvas = clone.querySelector('canvas');
    if (srcCanvas && cloneCanvas) {
      const img = document.createElement('img');
      img.src = srcCanvas.toDataURL('image/png');
      cloneCanvas.replaceWith(img);
    }
    const w = window.open('', '_blank', 'width=900,height=650');
    if (!w) { setErr(t('tools.card.popupBlocked')); return; }
    w.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>Carte CCG</title>'
      + '<style>' + CARTE_CSS + CARTE_PRINT_CSS + '</style></head><body>'
      + '<div class="cg-print-wrap">' + clone.outerHTML + '</div></body></html>'
    );
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  }

  // Partage de la carte elle-même (image PNG). Sur mobile : feuille de partage native (WhatsApp,
  // Mail…) avec l'image en pièce jointe. Sur desktop (pas de partage de fichier) : téléchargement
  // du PNG + ouverture de WhatsApp Web pour y joindre l'image.
  const [partage, setPartage] = useState(false);
  async function partager() {
    setPartage(true); setErr('');
    try {
      const nom = (cap(f.prenom) + '-' + cap(f.nom)).replace(/\s+/g, '-').replace(/[^A-Za-zÀ-ÿ-]/g, '') || 'carte';
      const blob = await carteVersBlob(printAreaRef.current, 3);
      const file = new File([blob], `carte-CCG-${nom}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Carte de visite CCG', text: affiche }); }
        catch (e) { if (e && e.name === 'AbortError') { /* partage annulé */ } else throw e; }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        window.open('https://wa.me/?text=' + encodeURIComponent(t('tools.card.waText')), '_blank', 'noopener');
      }
    } catch (e) { setErr(t('tools.card.shareError') + ' ' + (e?.message || e)); }
    finally { setPartage(false); }
  }

  function reset() {
    setF(prev => ({ ...prev, prenom: '', nom: '', fonction: '', tel: '', mobile: '', email: '' }));
    setPhoto('');
  }

  return (
    <div>
      <style>{CARTE_CSS}</style>
      <h1 className="page-title">{t('nav.tools.card')}</h1>
      {err && <div className="alert alert-danger" style={{ maxWidth: 680 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,1fr) auto', gap: 26, alignItems: 'start' }} className="cg-layout">
        {/* Formulaire (style app) */}
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
            <label className="field">{t('tools.card.firstName')} *
              <input value={f.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Siradio" />
            </label>
            <label className="field">{t('tools.card.lastName')} *
              <input value={f.nom} onChange={e => set('nom', e.target.value)} placeholder="Diallo" />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>{t('tools.card.role')}
              <input value={f.fonction} onChange={e => set('fonction', e.target.value)} placeholder="Directeur des Systèmes d'Information" />
            </label>
            <label className="field">{t('tools.card.phone')}
              <input value={f.tel} onChange={e => set('tel', e.target.value)} placeholder="+224 623 23 39 20" />
            </label>
            <label className="field">{t('tools.card.mobile')}
              <input value={f.mobile} onChange={e => set('mobile', e.target.value)} placeholder="+224 610 10 27 84" />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>{t('tools.card.email')}
              <input value={f.email} onChange={e => set('email', e.target.value)} placeholder="prenom.nom@ccggroupe.com" />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>{t('tools.card.photo')}
              <input type="file" accept="image/*" onChange={onPhoto} />
              {photo && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6, width: 'fit-content' }} onClick={() => setPhoto('')}>{t('tools.card.removePhoto')}</button>}
            </label>
          </div>

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--color-text)' }}>{t('tools.card.company')}</summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginTop: 12 }}>
              <label className="field">{t('tools.card.org')}<input value={f.org} onChange={e => set('org', e.target.value)} /></label>
              <label className="field">{t('tools.card.website')}<input value={f.site} onChange={e => set('site', e.target.value)} /></label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>{t('tools.card.address')}<input value={f.adresse} onChange={e => set('adresse', e.target.value)} /></label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>{t('tools.card.slogan')}<input value={f.slogan} onChange={e => set('slogan', e.target.value)} /></label>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>{t('tools.card.companyHint')}</div>
          </details>
        </div>

        {/* Aperçu + actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={clair} onChange={e => setClair(e.target.checked)} /> {t('tools.card.lightVariant')}
          </label>
          <div className="cg-cardshell" ref={printAreaRef}>
            <div className={`cg-card${clair ? ' cg-clair' : ''}`}>
              <div className="cg-accent" /><div className="cg-halo" />
              <div className="cg-left">
                <div className="cg-head">
                  <span className="cg-chip"><img src={CCG_LOGO} alt="CCG" /></span>
                  <div className="cg-org">{f.org || 'CCG Groupe'}</div>
                </div>
                <div className="cg-slogan">{f.slogan}</div>
                <div className="cg-id">
                  <div className="cg-name">{affiche}</div>
                  <div className="cg-title">{f.fonction}</div>
                </div>
                <div className="cg-rule" />
                <div className="cg-rows">
                  <Row icon="tel" value={f.tel} />
                  <Row icon="mobile" value={f.mobile} />
                  <Row icon="email" value={f.email} />
                  <Row icon="site" value={f.site} />
                  <Row icon="adr" value={f.adresse} extraClass="cg-row-adr" />
                </div>
              </div>
              <div className="cg-right">
                {photo && <img className="cg-photo cg-on" src={photo} alt="" />}
                <div className="cg-qrtile"><canvas ref={qrRef} /></div>
                <div className="cg-qrcap">{t('tools.card.scanMe')}<b>{affiche}</b></div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={partager} disabled={partage}>{partage ? t('tools.card.preparing') : t('tools.card.share')}</button>
            <button type="button" className="btn btn-secondary" onClick={imprimer}>{t('tools.card.print')}</button>
            <button type="button" className="btn btn-secondary" onClick={dlQR} disabled={prep}>{prep ? t('tools.card.preparing') : t('tools.card.downloadQr')}</button>
            <button type="button" className="btn btn-secondary" onClick={reset}>{t('tools.card.clear')}</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>{t('tools.card.note')}</div>
        </div>
      </div>
    </div>
  );
}
