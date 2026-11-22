// Bulletin d'analyse QHSE (PDF) — réutilise l'en-tête, le tableau et le pied partagés (utils/pdf.js)
// pour hériter de l'identité visuelle CCG. Document en français.
const { renderPdf, renderLetterhead, simpleTable, BRAND_NAVY, MUTED_GRAY } = require('../../utils/pdf');

const CONF = { conforme: 'Conforme', non_conforme: 'Non conforme', en_attente: 'En attente', sans_spec: 'Sans spécification' };
const FLAG = { numerique: '', non_detecte: 'Non détecté', inf_ld: '< LD', inf_lq: '< LQ', invalide: 'Invalide', en_attente: 'En attente' };
const d = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');

async function generateAnalysisBulletinPdf({ analysis, sample, results, techNom, validatorNom }) {
  return renderPdf(doc => {
    renderLetterhead(doc, "Bulletin d'analyse", null);

    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_NAVY).text('Échantillon');
    doc.fillColor('black').font('Helvetica').fontSize(9).moveDown(0.2);
    [
      ['N° échantillon', sample.numero || '—'],
      ['Produit', sample.product_nom || sample.nature || '—'],
      ['Format', sample.format_libelle || '—'],
      ['N° de lot', sample.numero_lot || '—'],
      ['DP / DE', `${d(sample.dp)} / ${d(sample.de)}`],
      ["Type d'analyse", analysis.type_libelle || '—'],
      ['Technicien', techNom || '—'],
      ["Date d'analyse", d(analysis.date_analyse)],
    ].forEach(([k, v]) => doc.text(`${k} : ${v}`));

    doc.moveDown(0.6);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_NAVY)
      .text(`Conformité globale : ${CONF[analysis.conformite] || '—'}`);
    doc.fillColor('black').font('Helvetica').moveDown(0.4);

    const cols = [
      { label: 'Paramètre', key: 'param', width: 150 },
      { label: 'Résultat', key: 'valeur', width: 90 },
      { label: 'Unité', key: 'unite', width: 70 },
      { label: 'Conformité', key: 'conf', width: 95, align: 'center' },
      { label: 'Observation', key: 'obs', width: 90 },
    ];
    const rows = results.map(r => ({
      param: r.param_libelle,
      valeur: (r.result_flag && r.result_flag !== 'numerique')
        ? (FLAG[r.result_flag] || '')
        : (r.valeur_num != null ? String(r.valeur_num) : (r.valeur_text || '—')),
      unite: r.unite || '',
      conf: CONF[r.conformite] || '—',
      obs: r.observation || '',
    }));
    simpleTable(doc, cols, rows);

    doc.moveDown(0.6).fontSize(9);
    if (analysis.statut === 'valide') {
      doc.fillColor(MUTED_GRAY).text(`Validé par ${validatorNom || '—'} le ${d(analysis.validated_at)}`);
    } else {
      doc.fillColor('#b5760a').text('Document provisoire — analyse non validée.');
    }
    doc.fillColor('black');
  }, { footerNote: "Bulletin d'analyse — généré automatiquement" });
}

module.exports = { generateAnalysisBulletinPdf };
