import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { CCG_LOGO } from './ccgLogo';
import styles from './Signature.module.css';

// Corrige la casse : « SIRADIO », « siradio » → « Siradio » ; noms composés respectés.
const capitaliser = s => (s || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr')
  .replace(/(^|[\s'’-])(\p{L})/gu, (m, sep, c) => sep + c.toLocaleUpperCase('fr'));
const echappe = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FORMULES = {
  Bilingue: ['Cordialement / Regards,', 'Bien cordialement / Best regards,'],
  'Français': ['Cordialement,', 'Bien cordialement,', 'Bien à vous,', 'Sincères salutations,', 'Respectueusement,', 'Merci et bonne journée,'],
  English: ['Best regards,', 'Kind regards,', 'Regards,', 'Sincerely,', 'Many thanks,'],
};

// Construit la signature HTML (tableaux + styles en ligne : seule construction qu'Outlook rende juste).
function buildSignature(f) {
  const police = 'font-family:Calibri,Arial,Helvetica,sans-serif';
  const corps = police + ';font-size:14px;color:#1A1A1A;line-height:1.55';
  const v = s => echappe((s || '').trim());
  const brut = t => t.replace(/[^+0-9]/g, '');

  const formule = v(f.formule);
  const nomAffiche = echappe([capitaliser(f.prenom), capitaliser(f.nom)].filter(Boolean).join(' '));
  const fonction = v(f.fonction);
  const tel1 = v(f.tel1), tel2 = v(f.tel2);
  const mail = v(f.mail), adresse = v(f.adresse);
  const linkedin = v(f.linkedin), site = v(f.site);

  const ligne = (picto, contenu) =>
    '<tr><td style="padding:1px 8px 1px 0;vertical-align:top;font-size:14px;">' + picto + '</td>'
    + '<td style="padding:1px 0;vertical-align:top;' + corps + ';">' + contenu + '</td></tr>';
  const lien = (href, texte, couleur) =>
    '<a href="' + href + '" style="color:' + (couleur || '#1155CC') + ';text-decoration:underline;">' + texte + '</a>';
  const numero = (t, wa) => t
    ? lien('tel:' + brut(t), t, '#1A1A1A') + (wa ? ' <strong style="color:#1F5FBF;">(WhatsApp)</strong>' : '')
    : '';
  const tels = [numero(tel1, f.wa1), numero(tel2, f.wa2)].filter(Boolean).join(' &nbsp;|&nbsp; ');

  const lignes = [];
  if (tels) lignes.push(ligne('&#128222;', '<strong>' + tels + '</strong>'));
  if (mail) lignes.push(ligne('&#9993;', lien('mailto:' + mail, mail)));
  if (adresse) lignes.push(ligne('&#128205;', '<strong>' + adresse + '</strong>'));
  if (linkedin) lignes.push(ligne('&#128279;', 'LinkedIn&nbsp;: ' + lien(linkedin, linkedin)));
  if (site) {
    const href = /^https?:/i.test(site) ? site : 'https://' + site.replace(/^www\./i, 'www.');
    lignes.push(ligne('&#127760;', lien(href, site)));
  }

  return [
    formule ? '<div style="' + corps + ';padding:0 0 16px 0;">' + formule + '</div>' : '',
    '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;', police, ';">',
    '<tr>',
    '<td style="padding:0 18px 0 0;vertical-align:top;">',
    '<img src="', CCG_LOGO, '" alt="CCG" width="110" height="76" style="display:block;border:0;outline:none;text-decoration:none;">',
    '</td>',
    '<td style="padding:0 0 0 18px;border-left:2px solid #1F5FBF;vertical-align:top;">',
    '<div style="', police, ';font-size:16px;font-weight:bold;color:#1F5FBF;line-height:1.3;">', nomAffiche, '</div>',
    '<div style="', police, ';font-size:14px;font-weight:bold;color:#1A1A1A;line-height:1.4;padding-top:2px;">', fonction, '</div>',
    '<div style="height:9px;line-height:9px;font-size:0;">&nbsp;</div>',
    '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
    lignes.join(''),
    '</table>',
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

export default function Signature() {
  const { user } = useAuth();
  const { t } = useI18n();
  const apercuRef = useRef(null);
  const [etat, setEtat] = useState('');

  // Pré-remplissage depuis le compte connecté (prénom, nom, fonction, e-mail, téléphone).
  const [f, setF] = useState(() => ({
    formule: 'Cordialement / Regards,',
    prenom: user?.prenom || '',
    nom: user?.nom || '',
    fonction: user?.fonction || '',
    tel1: user?.telephone || '',
    wa1: false,
    tel2: '',
    wa2: false,
    mail: user?.email || '',
    adresse: 'Sanoyah km 38 / Conakry République de Guinée',
    linkedin: '',
    site: 'www.ccggroupe.com',
  }));
  const set = (k, val) => setF(prev => ({ ...prev, [k]: val }));

  const html = useMemo(() => buildSignature(f), [f]);

  function dire(msg) { setEtat(msg); setTimeout(() => setEtat(''), 3000); }
  async function copier() {
    try {
      await navigator.clipboard.write([new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([apercuRef.current?.innerText || ''], { type: 'text/plain' }),
      })]);
      dire(t('tools.sig.copied'));
    } catch (e) {
      const sel = window.getSelection(), r = document.createRange();
      r.selectNodeContents(apercuRef.current);
      sel.removeAllRanges(); sel.addRange(r);
      const ok = document.execCommand('copy');
      sel.removeAllRanges();
      dire(ok ? t('tools.sig.copied') : t('tools.sig.copyManual'));
    }
  }

  return (
    <div className={styles.wrap}>
      <h1 className="page-title">{t('nav.tools.signature')}</h1>
      <p className={styles.chapo}>{t('tools.sig.chapo')}</p>

      <h2>{t('tools.sig.step1')}</h2>
      <div className={styles.carte}>
        <div className={styles.grille}>
          <div>
            <label htmlFor="sig-choix">{t('tools.sig.greeting')}</label>
            <select id="sig-choix" value={f.formule} onChange={e => set('formule', e.target.value)}>
              {Object.entries(FORMULES).map(([grp, opts]) => (
                <optgroup key={grp} label={grp}>
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </optgroup>
              ))}
              <option value="">{t('tools.sig.noGreeting')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="sig-formule">{t('tools.sig.greetingText')} <span className={styles.doux}>{t('tools.sig.editable')}</span></label>
            <input id="sig-formule" value={f.formule} onChange={e => set('formule', e.target.value)} />
          </div>
          <div>
            <label htmlFor="sig-prenom">{t('tools.sig.firstName')}</label>
            <input id="sig-prenom" value={f.prenom} onChange={e => set('prenom', e.target.value)} />
          </div>
          <div>
            <label htmlFor="sig-nom">{t('tools.sig.lastName')}</label>
            <input id="sig-nom" value={f.nom} onChange={e => set('nom', e.target.value)} />
          </div>
          <div>
            <label htmlFor="sig-fonction">{t('tools.sig.role')}</label>
            <input id="sig-fonction" value={f.fonction} onChange={e => set('fonction', e.target.value)} />
          </div>
          <div>
            <label htmlFor="sig-tel1">{t('tools.sig.phone1')}</label>
            <input id="sig-tel1" value={f.tel1} onChange={e => set('tel1', e.target.value)} />
            <label className={styles.case} htmlFor="sig-wa1"><input type="checkbox" id="sig-wa1" checked={f.wa1} onChange={e => set('wa1', e.target.checked)} /> {t('tools.sig.whatsapp')}</label>
          </div>
          <div>
            <label htmlFor="sig-tel2">{t('tools.sig.phone2')} <span className={styles.doux}>{t('tools.sig.optional')}</span></label>
            <input id="sig-tel2" value={f.tel2} onChange={e => set('tel2', e.target.value)} />
            <label className={styles.case} htmlFor="sig-wa2"><input type="checkbox" id="sig-wa2" checked={f.wa2} onChange={e => set('wa2', e.target.checked)} /> {t('tools.sig.whatsapp')}</label>
          </div>
          <div>
            <label htmlFor="sig-mail">{t('tools.sig.email')}</label>
            <input id="sig-mail" value={f.mail} onChange={e => set('mail', e.target.value)} />
          </div>
          <div className={styles.plein}>
            <label htmlFor="sig-adresse">{t('tools.sig.address')} <span className={styles.doux}>{t('tools.sig.addressHint')}</span></label>
            <input id="sig-adresse" value={f.adresse} onChange={e => set('adresse', e.target.value)} />
          </div>
          <div className={styles.plein}>
            <label htmlFor="sig-linkedin">LinkedIn <span className={styles.doux}>{t('tools.sig.linkedinHint')}</span></label>
            <input id="sig-linkedin" value={f.linkedin} onChange={e => set('linkedin', e.target.value)} />
          </div>
          <div className={styles.plein}>
            <label htmlFor="sig-site">{t('tools.sig.site')}</label>
            <input id="sig-site" value={f.site} onChange={e => set('site', e.target.value)} />
          </div>
        </div>
      </div>

      <h2>{t('tools.sig.step2')}</h2>
      {/* Aperçu fidèle : le HTML de signature est injecté tel quel (c'est ce qui sera collé). */}
      <div className={styles.apercu} ref={apercuRef} dangerouslySetInnerHTML={{ __html: html }} />
      <div className={styles.actions}>
        <button type="button" className="btn btn-primary" onClick={copier}>{t('tools.sig.copy')}</button>
        <span className={styles.etat}>{etat}</span>
      </div>

      <h2>{t('tools.sig.step3')}</h2>
      <div className={styles.carte}>
        <ol>
          <li dangerouslySetInnerHTML={{ __html: t('tools.sig.install1') }} />
          <li dangerouslySetInnerHTML={{ __html: t('tools.sig.install2') }} />
        </ol>
        <div className={styles.note}>
          <p dangerouslySetInnerHTML={{ __html: t('tools.sig.note1') }} />
          <p dangerouslySetInnerHTML={{ __html: t('tools.sig.note2') }} />
        </div>
      </div>
    </div>
  );
}
