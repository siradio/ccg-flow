const { one, withTransaction } = require('../../db');
const repo = require('./purchase-requests.repository');
const poRepo = require('../purchase-orders/purchase-orders.repository');
const suppliersService = require('../referentials/suppliers.service');
const branding = require('../referentials/entity-branding.service');
const attachmentsService = require('../attachments/attachments.service');
const workflowEngine = require('../workflow/workflow.engine');
const audit = require('../audit/audit.service');
const notifications = require('../notifications/notifications.service');
const mailer = require('../../utils/mailer');
const pdf = require('../../utils/pdf');
const numbering = require('../../utils/numbering');
const { hasRoleOnEntity, hasAnyRoleOnEntity, isSuperAdmin } = require('../../middleware/permissions');
const { httpError } = require('../../utils/httpError');
const settings = require('../settings/settings.service');

const MODULE_CODE = 'demande_achat';

async function assertRole(user, roleCode, entityId, actionLabel) {
  if (!hasRoleOnEntity(user, roleCode, entityId)) {
    throw httpError(403, `Rôle "${roleCode}" requis sur cette entité pour ${actionLabel}.`);
  }
}

async function getFullDetail(id) {
  const pr = await repo.getById(id);
  if (!pr) return null;
  const [lines, quoteRequests, quotes, approvals, purchaseOrder, attachments] = await Promise.all([
    repo.getLines(id),
    repo.getQuoteRequestsForPR(id),
    repo.getQuotesForPR(id),
    repo.getApprovalsForPR(id),
    poRepo.getByPurchaseRequestId(id),
    repo.getAttachments(id),
  ]);
  for (const qr of quoteRequests) {
    qr.suppliers = await repo.getQuoteRequestSuppliers(qr.id);
  }
  // Prix par ligne de chaque devis (pour l'affichage détaillé et l'édition des prix par le service
  // achat) + frais annexes (TVA, freight…). Le total d'un devis = articles + frais → coût complet
  // comparable entre fournisseurs.
  for (const q of quotes) {
    const ql = await repo.getQuoteLines(q.id);
    q.lignes = ql.map(x => ({ lineId: x.purchase_request_line_id, prixUnitaire: Number(x.prix_unitaire) }));
    const qf = await repo.getQuoteFees(q.id);
    q.frais = qf.map(f => ({ feeTypeId: f.fee_type_id, libelle: f.libelle, montant: Number(f.montant) }));
    q.montant_frais = q.frais.reduce((s, f) => s + f.montant, 0);
    q.total = Number(q.montant || 0) + q.montant_frais;
  }
  // Frais reportés sur la demande (copie du devis retenu) : détail + sous-total.
  const feesPr = await repo.getPurchaseRequestFees(id);
  const fees = feesPr.map(f => ({ feeTypeId: f.fee_type_id, libelle: f.libelle, montant: Number(f.montant) }));
  return { ...pr, lines, quote_requests: quoteRequests, quotes, approvals, purchase_order: purchaseOrder, attachments, fees };
}

// À utiliser depuis les routes HTTP : vérifie que l'utilisateur a le droit de voir cette demande
// (un rôle sur son entité, ou en être l'auteur) avant de renvoyer le détail complet.
async function getFullDetailForUser(user, id) {
  const pr = await repo.getById(id);
  if (!pr) return null;
  if (!hasAnyRoleOnEntity(user, pr.entity_id) && pr.requester_user_id !== user.id) {
    throw httpError(403, "Vous n'avez pas accès à cette demande.");
  }
  return getFullDetail(id);
}

async function createDraft(user, { entityId, siteId, objet, justification, devise, businessUnitId }) {
  if (!hasAnyRoleOnEntity(user, entityId)) {
    throw httpError(403, "Vous n'avez aucun rôle sur cette entité.");
  }
  if (!objet) throw httpError(400, 'objet requis.');

  const template = await workflowEngine.getTemplate(MODULE_CODE);
  if (!template) throw httpError(500, 'Workflow "demande_achat" non configuré.');

  // La Business Unit n'a de sens que pour SOGUIPAL (les BU y sont rattachées côté métier) ; on ne
  // la persiste que dans ce cas pour éviter une BU parasite sur une autre entité. NULL = « Toutes
  // les BU » ou non renseignée. Purement informatif, aucun impact sur le circuit.
  const code = await entityCode(entityId);
  const buId = code === 'SOGUIPAL' && businessUnitId ? Number(businessUnitId) : null;

  let pr = await repo.createDraft({
    entityId, workflowTemplateId: template.id, requesterId: user.id, siteId, objet, justification, devise, businessUnitId: buId,
  });
  pr = await repo.setNumero(pr.id, numbering.formatRequestNumber(code, pr.id));
  await audit.logAction({ tableName: 'purchase_requests', recordId: pr.id, purchaseRequestId: pr.id, action: 'create', userId: user.id });
  return getFullDetail(pr.id);
}

async function entityCode(entityId) {
  const row = await one('SELECT code FROM entities WHERE id = $1', [entityId]);
  return row ? row.code : 'GRP';
}

function assertOwnerAndStatus(pr, user, expectedStatus) {
  if (pr.requester_user_id !== user.id && !hasRoleOnEntity(user, 'super_admin', null)) {
    throw httpError(403, "Seul l'auteur de la demande peut la modifier.");
  }
  if (pr.status !== expectedStatus) {
    throw httpError(400, `Action impossible : la demande n'est plus au statut "${expectedStatus}".`);
  }
}

// NB : la modification d'une DA déjà engagée dans le circuit achat ne passe PAS par l'édition des
// lignes. Pour revenir sur un devis déjà retenu, le service achat utilise « Rouvrir la consultation »
// (reopenConsultation) qui ramène la demande en 'devis_en_cours' de façon tracée.
async function addLine(user, prId, data) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  assertOwnerAndStatus(pr, user, 'brouillon');
  if (!data.quantite) throw httpError(400, 'quantite requise.');
  const line = await repo.addLine(prId, data);
  await audit.logAction({ tableName: 'purchase_request_lines', recordId: line.id, purchaseRequestId: prId, action: 'add_line', userId: user.id, details: data });
  return line;
}

async function updateLine(user, prId, lineId, data) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  assertOwnerAndStatus(pr, user, 'brouillon');
  const line = await repo.updateLine(lineId, data);
  if (!line) throw httpError(404, 'Ligne introuvable.');
  await audit.logAction({ tableName: 'purchase_request_lines', recordId: lineId, purchaseRequestId: prId, action: 'update_line', userId: user.id, details: data });
  return line;
}

async function deleteLine(user, prId, lineId) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  assertOwnerAndStatus(pr, user, 'brouillon');
  await repo.deleteLine(lineId);
  await audit.logAction({ tableName: 'purchase_request_lines', recordId: lineId, purchaseRequestId: prId, action: 'delete_line', userId: user.id });
}

async function submit(user, prId) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  assertOwnerAndStatus(pr, user, 'brouillon');
  const lines = await repo.getLines(prId);
  if (lines.length === 0) {
    // Le détail des articles (lignes) est facultatif si un proforma est déjà joint : dans ce cas le
    // détail figure sur le proforma. Sinon, au moins une ligne est requise.
    const att = await one('SELECT COUNT(*)::int AS n FROM attachments WHERE purchase_request_id = $1', [prId]);
    if (!att || att.n === 0) throw httpError(400, 'Ajoutez au moins un article, ou joignez un proforma, avant de soumettre.');
  }

  // Avant de mobiliser le Service Achat (recherche fournisseurs, devis...), l'expression de
  // besoin doit être validée par un validateur_besoin (n'importe qui détenant ce rôle sur cette
  // entité — voir §2.4bis SPEC.md) — évite de faire ce travail pour rien si la dépense n'est
  // finalement pas approuvée.
  await repo.updateStatusAndStep(prId, 'en_attente_validation_besoin', null);
  await audit.logAction({ tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId, action: 'submit', userId: user.id });
  await notifications.notifyRoleOnEntity(
    pr.entity_id, 'validateur_besoin', 'Validation requise — expression de besoin',
    `La demande ${pr.numero} (${pr.objet}) attend la validation de l'expression de besoin.`, `/purchase-requests/${prId}`
  );
  return getFullDetail(prId);
}

// Permet au service achat de créer un fournisseur à la volée depuis l'écran de traitement d'une
// demande, sans passer par Référentiels → Fournisseurs (qui exige le module ref_suppliers, une
// permission distincte) — autorisé ici via le même rôle service_achat déjà requis pour consulter
// des fournisseurs sur cette demande. Mêmes champs que le référentiel complet (suppliers.service.js,
// une seule liste de champs partagée), entity_ids compris : un fournisseur créé ici n'est pas une
// fiche au rabais, il se retrouve à l'identique dans Référentiels → Fournisseurs. Si le formulaire
// ne coche aucune entité, on rattache par défaut à l'entité de la demande en cours (sinon le
// fournisseur créé n'apparaîtrait dans aucune liste filtrée par entité, y compris celle-ci).
async function quickAddSupplier(user, prId, fields) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'ajouter un fournisseur');

  const { entity_ids, ...supplierFields } = fields;
  const supplier = await suppliersService.createSupplier(supplierFields);
  const linkedEntityIds = entity_ids && entity_ids.length ? entity_ids : [pr.entity_id];
  for (const entityId of linkedEntityIds) {
    await suppliersService.linkSupplierToEntity(supplier.id, entityId);
  }
  await audit.logAction({ tableName: 'suppliers', recordId: supplier.id, purchaseRequestId: prId, action: 'quick_add_supplier', userId: user.id, details: { nom: supplierFields.nom } });
  return { ...supplier, entity_ids: linkedEntityIds };
}

// Le service achat crée la demande de devis : ceci fait à la fois office d'"analyse" (SPEC §3.1 pt.2)
// et de lancement de la consultation fournisseurs (pt.3) — pas d'endpoint séparé pour l'analyse seule.
async function createQuoteRequest(user, prId, { supplierIds, message }) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'lancer une demande de devis');
  // 'devis_en_cours' autorisé : permet d'ajouter une nouvelle consultation (autres fournisseurs)
  // pendant la phase devis, y compris après une réouverture de consultation (voir reopenConsultation).
  if (!['soumise', 'en_analyse_achat', 'devis_en_cours'].includes(pr.status)) {
    throw httpError(400, `Action impossible depuis le statut "${pr.status}".`);
  }
  const minSuppliers = await settings.getIntValue('min_suppliers_devis', 2);
  if (!Array.isArray(supplierIds) || supplierIds.length < minSuppliers) {
    throw httpError(400, `Sélectionnez au moins ${minSuppliers} fournisseur(s) à consulter.`);
  }

  const qr = await repo.createQuoteRequest(prId, user.id, message);
  for (const supplierId of supplierIds) {
    await repo.addQuoteRequestSupplier(qr.id, supplierId);
  }
  await repo.updateStatusAndStep(prId, 'devis_en_cours', null);
  await audit.logAction({ tableName: 'quote_requests', recordId: qr.id, purchaseRequestId: prId, action: 'quote_request_created', userId: user.id, details: { supplierIds } });
  return { ...qr, suppliers: await repo.getQuoteRequestSuppliers(qr.id) };
}

// Texte par défaut si l'achat n'a pas personnalisé le message à la création de la consultation
// (§3.1 pt.4) — dupliqué côté frontend (DetailPage.jsx) pour que le texte "à copier" affiché à
// l'écran soit TOUJOURS identique à celui réellement envoyé par email.
function defaultQuoteRequestBody(numero) {
  return `Bonjour,\n\nVeuillez trouver ci-joint notre demande de devis ${numero}.\n\nCordialement.`;
}

// Normalise une liste d'adresses en copie (CC) : accepte une chaîne « a@x, b@y » ou un tableau,
// ne garde que les entrées contenant « @ », renvoie une chaîne CSV ou undefined si vide. Sert au
// service achat pour se mettre en copie et/ou ajouter d'autres destinataires à l'envoi au fournisseur.
function cleanCc(cc) {
  const list = Array.isArray(cc) ? cc : String(cc || '').split(',');
  const valid = list.map(s => String(s).trim()).filter(s => s.includes('@'));
  return valid.length ? [...new Set(valid)].join(',') : undefined;
}

async function sendQuoteRequest(user, prId, quoteRequestId, cc) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'envoyer la demande de devis');

  const qr = await repo.getQuoteRequest(quoteRequestId);
  const bodyText = qr?.message?.trim() || defaultQuoteRequestBody(pr.numero);
  const lines = await repo.getLines(prId);
  const { logo } = await branding.getEntityImages(pr.entity_id);
  const suppliers = await repo.getQuoteRequestSuppliers(quoteRequestId);
  const results = [];
  for (const s of suppliers) {
    if (s.statut !== 'a_envoyer') { results.push({ supplierId: s.supplier_id, skipped: true }); continue; }
    try {
      const buffer = await pdf.generateQuoteRequestPdf({
        purchaseRequest: pr, lines, entityNom: pr.entity_nom, supplierNom: s.supplier_nom, logoBuffer: logo,
        decimals: await settings.getIntValue('achats_decimales', 4),
      });
      await mailer.sendMail({
        to: s.supplier_email,
        cc: cleanCc(cc),
        subject: `Demande de devis — ${pr.numero}`,
        text: bodyText,
        html: mailer.renderMailTemplate({
          title: 'Demande de devis',
          bodyHtml: `<p>${bodyText.replace(/\n/g, '<br/>')}</p>`,
        }),
        attachments: [{ filename: `demande-devis-${pr.numero}.pdf`, content: buffer }],
      });
      await repo.markQuoteRequestSupplierSent(s.id);
      await audit.logAction({ tableName: 'quote_request_suppliers', recordId: s.id, purchaseRequestId: prId, action: 'quote_request_sent', userId: user.id, details: { supplier: s.supplier_nom } });
      results.push({ supplierId: s.supplier_id, sent: true });
    } catch (e) {
      // Échec isolé par fournisseur (ex. SMTP indisponible/rejeté par le serveur de messagerie) :
      // ne bloque jamais les autres envois du même lot, et laisse le fournisseur en "a_envoyer"
      // pour un nouvel essai, ou pour basculer sur le PDF/texte à envoyer manuellement (voir
      // getQuoteRequestSupplierPdf ci-dessous). Le détail technique reste dans les logs serveur
      // (console.error via errorHandler ailleurs) — pas exposé tel quel au client.
      console.error(`Échec envoi devis à ${s.supplier_email} (fournisseur ${s.supplier_nom}) :`, e.message);
      results.push({ supplierId: s.supplier_id, sent: false, error: "Échec de l'envoi — le serveur de messagerie a refusé le message." });
    }
  }
  return results;
}

// Envoi CIBLÉ de la demande de devis à UN fournisseur, avec possibilité de fournir une adresse
// email de remplacement (`emailOverride`) — utile quand le fournisseur n'a pas d'email renseigné
// dans le référentiel. À défaut d'override, on utilise l'email du fournisseur ; s'il n'y en a
// aucun, on renvoie une 400 explicite pour que l'UI propose la saisie.
async function sendQuoteRequestToSupplier(user, prId, qrsId, emailOverride, cc) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'envoyer la demande de devis');

  const s = await repo.getQuoteRequestSupplier(qrsId);
  if (!s) throw httpError(404, 'Fournisseur sollicité introuvable.');
  const to = (emailOverride || '').trim() || s.supplier_email;
  if (!to) throw httpError(400, "Ce fournisseur n'a pas d'adresse email : saisissez-en une pour l'envoi.");

  const qr = await repo.getQuoteRequest(s.quote_request_id);
  const bodyText = qr?.message?.trim() || defaultQuoteRequestBody(pr.numero);
  const lines = await repo.getLines(prId);
  const { logo } = await branding.getEntityImages(pr.entity_id);
  const buffer = await pdf.generateQuoteRequestPdf({
    purchaseRequest: pr, lines, entityNom: pr.entity_nom, supplierNom: s.supplier_nom, logoBuffer: logo,
    decimals: await settings.getIntValue('achats_decimales', 4),
  });
  try {
    await mailer.sendMail({
      to,
      cc: cleanCc(cc),
      subject: `Demande de devis — ${pr.numero}`,
      text: bodyText,
      html: mailer.renderMailTemplate({ title: 'Demande de devis', bodyHtml: `<p>${bodyText.replace(/\n/g, '<br/>')}</p>` }),
      attachments: [{ filename: `demande-devis-${pr.numero}.pdf`, content: buffer }],
    });
  } catch (e) {
    console.error(`Échec envoi devis à ${to} (fournisseur ${s.supplier_nom}) :`, e.message);
    throw httpError(502, "Échec de l'envoi — le serveur de messagerie a refusé le message.");
  }
  await repo.markQuoteRequestSupplierSent(s.id);
  await audit.logAction({ tableName: 'quote_request_suppliers', recordId: s.id, purchaseRequestId: prId, action: 'quote_request_sent', userId: user.id, details: { supplier: s.supplier_nom, to, cc: cleanCc(cc) || null } });
  return { sent: true, to };
}

// Permet de récupérer le PDF d'une demande de devis pour un fournisseur précis sans passer par
// l'envoi email — sert de repli quand l'envoi automatique échoue (§ ci-dessus) : le service achat
// télécharge le PDF et envoie lui-même le message (texte copiable via getQuoteRequestEmailPreview)
// depuis sa propre messagerie.
async function getQuoteRequestSupplierPdf(user, prId, qrsId) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  if (!hasAnyRoleOnEntity(user, pr.entity_id) && pr.requester_user_id !== user.id) {
    throw httpError(403, "Vous n'avez pas accès à cette demande.");
  }
  const supplier = await repo.getQuoteRequestSupplier(qrsId);
  if (!supplier) throw httpError(404, 'Fournisseur sollicité introuvable.');
  const lines = await repo.getLines(prId);
  const { logo } = await branding.getEntityImages(pr.entity_id);
  return pdf.generateQuoteRequestPdf({ purchaseRequest: pr, lines, entityNom: pr.entity_nom, supplierNom: supplier.supplier_nom, logoBuffer: logo, decimals: await settings.getIntValue('achats_decimales', 4) });
}

// Normalise une liste de frais annexes [{feeTypeId, montant, libelle?}] : ne garde que les montants
// > 0, et fige le libellé depuis le référentiel des types (snapshot) si non fourni.
async function normalizeFees(frais) {
  const rows = (Array.isArray(frais) ? frais : [])
    .map(f => ({ feeTypeId: f.feeTypeId ? Number(f.feeTypeId) : null, libelle: (f.libelle || '').trim(), montant: Number(f.montant) || 0 }))
    .filter(f => (f.feeTypeId || f.libelle) && f.montant > 0);
  if (!rows.length) return [];
  const types = await repo.listFeeTypes(false);
  const byId = new Map(types.map(t => [t.id, t.libelle]));
  return rows.map(f => ({ feeTypeId: f.feeTypeId, montant: f.montant, libelle: f.libelle || byId.get(f.feeTypeId) || 'Frais' }));
}

async function addQuote(user, prId, { quoteRequestSupplierId, montant, devise, notes, lignes, frais }, file) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'saisir un devis reçu');
  // Saisie possible pendant la phase devis, y compris quand un devis est déjà retenu
  // ('devis_selectionne') : permet d'ajouter/comparer un autre fournisseur puis de re-sélectionner,
  // sans « rouvrir la consultation ». Au-delà (validation aval, BC), la réouverture reste requise.
  if (!['devis_en_cours', 'devis_selectionne'].includes(pr.status)) throw httpError(400, `Action impossible depuis le statut "${pr.status}".`);

  // Nouveau modèle : prix unitaire par ligne → montant = somme(quantité × prix). Repli sur le
  // montant global (ancien client) si aucune ligne n'est fournie.
  let total = Number(montant) || 0;
  let lignesRows = null;
  if (Array.isArray(lignes) && lignes.length) {
    const prLines = await repo.getLines(prId);
    const byId = new Map(prLines.map(l => [l.id, l]));
    lignesRows = lignes
      .filter(x => byId.has(Number(x.lineId)))
      .map(x => ({ lineId: Number(x.lineId), prixUnitaire: Number(x.prixUnitaire) || 0 }));
    total = lignesRows.reduce((s, r) => s + r.prixUnitaire * Number(byId.get(r.lineId).quantite), 0);
  }
  if (!total) throw httpError(400, 'Saisissez au moins un prix de ligne (ou un montant).');

  const quote = await repo.createQuote(quoteRequestSupplierId, total, devise || pr.devise, notes);
  if (lignesRows) await repo.createQuoteLines(quote.id, lignesRows);
  // Frais annexes du devis (TVA, freight, FOB, transport…) — comparables entre fournisseurs.
  const feesRows = await normalizeFees(frais);
  if (feesRows.length) await repo.setQuoteFees(quote.id, feesRows);
  await audit.logAction({ tableName: 'quotes', recordId: quote.id, purchaseRequestId: prId, action: 'quote_received', userId: user.id, details: { montant: total, devise } });
  // Le devis PDF du fournisseur s'attache ici, directement au moment de la saisie du montant —
  // remplace l'ancien flux à deux étapes (saisir le devis, puis chercher la pièce jointe générique
  // plus bas sur la page) par un seul geste, et rattache le fichier à CE devis précis (quote_id),
  // pas à la demande entière, pour qu'il suive le bon fournisseur si plusieurs devis sont reçus.
  if (file) {
    const attachment = await attachmentsService.attachToQuote(quote.id, file, user.id);
    await audit.logAction({ tableName: 'attachments', recordId: attachment.id, purchaseRequestId: prId, action: 'attachment_uploaded', userId: user.id, details: { filename: file.originalname, quoteId: quote.id } });
  }
  return quote;
}

async function selectQuote(user, prId, quoteId) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'sélectionner un devis');
  if (!['devis_en_cours', 'devis_selectionne'].includes(pr.status)) {
    throw httpError(400, `Action impossible depuis le statut "${pr.status}".`);
  }

  // Sélection ATOMIQUE (une seule transaction) : soit tout est appliqué — devis retenu, fournisseur
  // et prix reportés sur les lignes, montant final ET passage en 'devis_selectionne' — soit rien.
  // Évite l'état incohérent « devis retenu mais statut resté devis_en_cours » (DA piégée, sans
  // bouton Valider) qu'une interruption entre deux écritures pouvait laisser auparavant.
  const quote = await withTransaction(async (tx) => {
    const selected = await repo.selectQuote(quoteId, prId, tx);
    if (!selected) throw httpError(404, 'Devis introuvable.');
    const q = await repo.getQuote(quoteId, tx);
    await repo.setLinesFournisseurRetenu(prId, q.supplier_id, tx);
    // Nouveau modèle : on recopie les prix par ligne du devis retenu (plus de répartition à parts
    // égales). Repli sur l'ancienne répartition si le devis n'a pas de détail ligne (ancien devis).
    const quoteLines = await repo.getQuoteLines(quoteId, tx);
    let montantFinal;
    if (quoteLines.length) {
      montantFinal = await repo.applyQuoteLinesToPrLines(prId, quoteLines, tx);
    } else {
      await repo.setLinesPrixUnitaireFinal(prId, q.montant, tx);
      montantFinal = q.montant;
    }
    await repo.setMontantFinal(prId, montantFinal, q.devise, tx);
    // Report des frais annexes du devis retenu sur la demande (coût complet = articles + frais).
    const qf = await repo.getQuoteFees(quoteId, tx);
    await repo.setPurchaseRequestFees(prId, qf, tx);
    await repo.updateStatusAndStep(prId, 'devis_selectionne', null, tx);
    return q;
  });
  await audit.logAction({ tableName: 'quotes', recordId: quoteId, purchaseRequestId: prId, action: 'quote_selected', userId: user.id, details: { supplier: quote.supplier_nom, montant: quote.montant } });
  return getFullDetail(prId);
}

// Édition des prix d'un devis déjà saisi par le service achat (ex. corriger la précision décimale).
// Possible pendant la phase devis (devis_en_cours / devis_selectionne). Si le devis édité est le devis
// RETENU, les nouveaux prix sont répercutés sur les lignes de la DA (prix_unitaire_final + montant final).
async function updateQuote(user, prId, quoteId, { devise, lignes, frais }, file) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'modifier un devis');
  if (!['devis_en_cours', 'devis_selectionne'].includes(pr.status)) {
    throw httpError(400, `Action impossible depuis le statut "${pr.status}".`);
  }
  const quotes = await repo.getQuotesForPR(prId);
  const quote = quotes.find(q => q.id === Number(quoteId));
  if (!quote) throw httpError(404, 'Devis introuvable.');

  const prLines = await repo.getLines(prId);
  const byId = new Map(prLines.map(l => [l.id, l]));
  const lignesRows = (Array.isArray(lignes) ? lignes : [])
    .filter(x => byId.has(Number(x.lineId)))
    .map(x => ({ lineId: Number(x.lineId), prixUnitaire: Number(x.prixUnitaire) || 0 }));
  const hasLignes = lignesRows.length > 0;
  const total = lignesRows.reduce((s, r) => s + r.prixUnitaire * Number(byId.get(r.lineId).quantite), 0);
  if (hasLignes && !total) throw httpError(400, 'Saisissez au moins un prix de ligne.');
  // Frais annexes : un tableau fourni (même vide) remplace les frais du devis ; absent = inchangé.
  const feesProvided = Array.isArray(frais);
  const feesRows = feesProvided ? await normalizeFees(frais) : null;
  if (!hasLignes && !file && !feesProvided) throw httpError(400, 'Rien à modifier.');
  const newDevise = devise || quote.devise;

  if (hasLignes || feesProvided) {
    await withTransaction(async (tx) => {
      if (hasLignes) {
        await repo.createQuoteLines(quoteId, lignesRows, tx);          // upsert des prix par ligne
        await repo.updateQuoteAmount(quoteId, total, newDevise, tx);   // montant recalculé
      } else if (devise) {
        await repo.updateQuoteAmount(quoteId, Number(quote.montant) || 0, newDevise, tx); // devise seule
      }
      if (feesProvided) await repo.setQuoteFees(quoteId, feesRows, tx); // frais du devis remplacés
      if (quote.selectionne) {                                         // devis retenu : répercuter sur la DA
        if (hasLignes) {
          const ql = await repo.getQuoteLines(quoteId, tx);
          await repo.applyQuoteLinesToPrLines(prId, ql, tx);
          await repo.setMontantFinal(prId, total, newDevise, tx);
        }
        if (feesProvided) await repo.setPurchaseRequestFees(prId, await repo.getQuoteFees(quoteId, tx), tx);
      }
    });
    await audit.logAction({ tableName: 'quotes', recordId: Number(quoteId), purchaseRequestId: prId, action: 'quote_updated', userId: user.id, details: { montant: hasLignes ? total : undefined, devise: newDevise, fraisModifies: feesProvided || undefined } });
  }

  // Pièce jointe (devis PDF) : rattachée à CE devis — permet d'ajouter le PDF oublié à la saisie.
  if (file) {
    const attachment = await attachmentsService.attachToQuote(Number(quoteId), file, user.id);
    await audit.logAction({ tableName: 'attachments', recordId: attachment.id, purchaseRequestId: prId, action: 'attachment_uploaded', userId: user.id, details: { filename: file.originalname, quoteId: Number(quoteId) } });
  }
  return getFullDetail(prId);
}

// Marque un fournisseur sollicité comme « consulté » SANS envoyer d'email — pour les fournisseurs
// sans adresse email (consultés par téléphone, en personne, ou via le PDF envoyé manuellement).
// Débloque la saisie de leur devis (l'écran « Devis reçus » ne liste que les fournisseurs consultés).
async function markSupplierConsulted(user, prId, qrsId) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'marquer le fournisseur comme consulté');
  const s = await repo.getQuoteRequestSupplier(qrsId);
  if (!s) throw httpError(404, 'Fournisseur sollicité introuvable.');
  await repo.markQuoteRequestSupplierSent(s.id);
  await audit.logAction({ tableName: 'quote_request_suppliers', recordId: s.id, purchaseRequestId: prId, action: 'quote_request_marked_sent', userId: user.id, details: { supplier: s.supplier_nom, mode: 'hors e-mail' } });
  return getFullDetail(prId);
}

// Rouvre la consultation d'une demande déjà en validation ou dont le bon de commande est généré —
// utile si l'accord ne se conclut finalement pas avec le fournisseur retenu. Annule le bon de
// commande, dé-sélectionne le devis, remet la demande en « devis_en_cours » pour choisir un autre
// devis, saisir un nouveau devis ou relancer une consultation. Les devis/consultations déjà reçus
// sont conservés ; seules les validations en attente sont retirées.
async function reopenConsultation(user, prId, commentaire) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'rouvrir la consultation');
  if (!['devis_selectionne', 'en_validation', 'en_validation_dga', 'bon_commande_genere'].includes(pr.status)) {
    throw httpError(400, `Réouverture impossible depuis le statut "${pr.status}".`);
  }
  // Motif obligatoire : la réouverture annule un bon de commande / une sélection déjà validés —
  // on trace toujours la raison (dans l'historique) pour l'auditabilité.
  if (!commentaire || !commentaire.trim()) throw httpError(400, 'Un motif est obligatoire pour rouvrir la consultation.');
  await poRepo.deleteByPurchaseRequestId(prId);   // supprime le bon de commande (+ ses PJ en cascade)
  await repo.unselectAllQuotes(prId);             // plus aucun devis retenu
  await repo.clearLinesSelection(prId);           // fournisseur retenu + prix final effacés sur les lignes
  await repo.clearMontantFinal(prId);             // montant final effacé
  await repo.clearPurchaseRequestFees(prId);      // frais annexes reportés effacés (nouveau devis à retenir)
  await repo.deletePendingApprovals(prId);        // validations en attente retirées (cycle abandonné)
  await repo.updateStatusAndStep(prId, 'devis_en_cours', null);
  await audit.logAction({ tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId, action: 'reouverture_consultation', userId: user.id, details: { depuis: pr.status, motif: commentaire.trim() } });
  await notifications.notifyRoleOnEntity(pr.entity_id, 'service_achat', 'Consultation rouverte', `La consultation de la demande ${pr.numero} a été rouverte : ${commentaire.trim()}`, `/purchase-requests/${prId}`);
  return getFullDetail(prId);
}

// ─── Validations en cascade ──────────────────────────────────────────────

async function validateStep(user, prId, commentaire) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  const template = await workflowEngine.getTemplate(MODULE_CODE);

  if (pr.status === 'en_attente_validation_besoin') {
    // Validation de l'expression de besoin par la DGA : ne touche pas current_step_id (ce
    // statut n'est pas piloté par workflow_steps, voir submit()) — passe directement à
    // "soumise" pour reprendre le circuit achat classique, exactement comme submit() le
    // faisait avant l'ajout de cette étape.
    await assertRole(user, 'validateur_besoin', pr.entity_id, "valider l'expression de besoin");
    await repo.updateStatusAndStep(prId, 'soumise', null);
    await audit.logAction({ tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId, action: 'validation_besoin', userId: user.id, details: { commentaire } });
    await notifications.notifyRoleOnEntity(
      pr.entity_id, 'service_achat', 'Nouvelle demande d\'achat',
      `La demande ${pr.numero} (${pr.objet}) attend votre analyse.`, `/purchase-requests/${prId}`
    );
    return getFullDetail(prId);
  }

  if (pr.status === 'devis_en_cours') {
    // État piégé : un devis est retenu (selectionne=true) mais la demande est restée en
    // 'devis_en_cours' (séquelle du bug « sélection non atomique »), ce qui privait le service achat
    // du bouton Valider. On normalise en ré-invoquant la sélection (atomique → 'devis_selectionne',
    // recalcule fournisseur/prix/montant) puis on enchaîne la validation de l'étape achat.
    await assertRole(user, 'service_achat', pr.entity_id, "valider l'étape achat");
    const quotes = await repo.getQuotesForPR(prId);
    const sel = quotes.find(q => q.selectionne);
    if (!sel) throw httpError(400, "Sélectionnez d'abord un devis avant de valider l'étape achat.");
    await selectQuote(user, prId, sel.id);        // → 'devis_selectionne' (atomique)
    return validateStep(user, prId, commentaire); // repasse dans la branche 'devis_selectionne' ci-dessous
  }

  if (pr.status === 'devis_selectionne') {
    // Validation de l'étape "achat" : passage à l'étape suivante du circuit CONFIGURÉ (jamais un code en dur —
    // voir SPEC.md §3.2), ancrée sur l'étape fixe "validation_achat" pour retrouver son ordre.
    await assertRole(user, 'service_achat', pr.entity_id, 'valider l\'étape achat');
    const achatStep = await workflowEngine.getStepByCode(template.id, 'validation_achat');
    if (!achatStep) throw httpError(500, 'Étape "validation_achat" non configurée.');
    const nextStep = await workflowEngine.getNextStep(template.id, achatStep.ordre);
    if (!nextStep) throw httpError(500, 'Configuration de workflow incomplète : aucune étape après la validation achat.');
    await repo.updateStatusAndStep(prId, 'en_validation', nextStep.id);
    await repo.createApproval(prId, nextStep.id);
    await audit.logAction({ tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId, action: 'validation_achat', userId: user.id, details: { commentaire } });
    await notifications.notifyRoleOnEntity(pr.entity_id, nextStep.role_code_requis, 'Validation requise', `La demande ${pr.numero} attend votre validation.`, `/purchase-requests/${prId}`);
    return getFullDetail(prId);
  }

  if (pr.status === 'en_validation' && pr.current_step_id) {
    const currentStep = { id: pr.current_step_id, code: pr.current_step_code, ordre: null };
    // besoin de l'ordre exact pour trouver l'étape suivante
    const steps = await workflowEngine.getSteps(template.id);
    const fullCurrentStep = steps.find(s => s.id === pr.current_step_id);
    // Le rôle requis vient TOUJOURS de la configuration de l'étape (éditable dans /admin/workflow),
    // jamais d'une table en dur — sinon éditer "Rôle requis" dans l'admin n'aurait aucun effet réel.
    const requiredRole = fullCurrentStep.role_code_requis;
    await assertRole(user, requiredRole, pr.entity_id, `valider l'étape ${currentStep.code}`);

    const approval = await repo.getPendingApproval(prId, currentStep.id);
    if (!approval) throw httpError(500, 'Aucune validation en attente pour cette étape.');
    await repo.decideApproval(approval.id, 'validee', user.id, commentaire);
    await audit.logAction({ tableName: 'approvals', recordId: approval.id, purchaseRequestId: prId, action: `validation_${currentStep.code}`, userId: user.id, details: { commentaire } });

    const nextStep = await workflowEngine.getNextStep(template.id, fullCurrentStep.ordre);
    if (!nextStep) throw httpError(500, 'Configuration de workflow incomplète : aucune étape suivante.');

    if (!nextStep.role_code_requis) {
      // Étape système : génération automatique du bon de commande.
      return generatePurchaseOrder(prId, user.id);
    }

    await repo.updateStatusAndStep(prId, 'en_validation', nextStep.id);
    await repo.createApproval(prId, nextStep.id);
    await notifications.notifyRoleOnEntity(pr.entity_id, nextStep.role_code_requis, 'Validation requise', `La demande ${pr.numero} attend votre validation.`, `/purchase-requests/${prId}`);
    return getFullDetail(prId);
  }

  if (pr.status === 'en_validation_dga') {
    // Validation DGA FINALE (après génération du BC) : approuve → clôture (le BC reste définitif).
    await assertRole(user, 'validateur_besoin', pr.entity_id, 'valider (DGA) le bon de commande');
    await repo.updateStatusAndStep(prId, 'bon_commande_genere', null);
    await audit.logAction({ tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId, action: 'validation_dga', userId: user.id, details: { commentaire } });
    await notifications.notify(pr.requester_user_id, 'Demande validée par la DGA', `Votre demande ${pr.numero} a été validée par la DGA. Le bon de commande est définitif.`, `/purchase-requests/${prId}`);
    return getFullDetail(prId);
  }

  throw httpError(400, `Aucune validation possible depuis le statut "${pr.status}".`);
}

async function rejectStep(user, prId, commentaire) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');

  if (pr.status === 'en_attente_validation_besoin') {
    await assertRole(user, 'validateur_besoin', pr.entity_id, "refuser l'expression de besoin");
    if (!commentaire) throw httpError(400, 'Un commentaire est obligatoire pour refuser une expression de besoin.');
    // Retour à brouillon (jamais d'annulation définitive, même principe que le reste du
    // circuit) : le demandeur peut revoir sa demande et la resoumettre.
    await repo.updateStatusAndStep(prId, 'brouillon', null);
    await audit.logAction({ tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId, action: 'rejet_besoin', userId: user.id, details: { commentaire } });
    await notifications.notify(
      pr.requester_user_id, 'Expression de besoin refusée',
      `Votre demande ${pr.numero} a été refusée par la DGA : ${commentaire}`, `/purchase-requests/${prId}`
    );
    return getFullDetail(prId);
  }

  if (pr.status === 'en_validation_dga') {
    // Refus DGA après génération du BC : commentaire obligatoire, le BC est ANNULÉ et la demande
    // repart à la Finances pour re-validation (qui régénérera le BC puis repassera en validation DGA).
    await assertRole(user, 'validateur_besoin', pr.entity_id, 'refuser (DGA) le bon de commande');
    if (!commentaire || !commentaire.trim()) throw httpError(400, 'Un commentaire est obligatoire pour refuser à la validation DGA.');
    const template = await workflowEngine.getTemplate(MODULE_CODE);
    const financesStep = await workflowEngine.getStepByCode(template.id, 'finances');
    if (!financesStep) throw httpError(500, 'Étape "finances" non configurée.');
    await poRepo.deleteByPurchaseRequestId(prId);          // le bon de commande généré est annulé
    await repo.updateStatusAndStep(prId, 'en_validation', financesStep.id);
    await repo.createApproval(prId, financesStep.id);        // la Finances doit re-valider
    await audit.logAction({ tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId, action: 'refus_validation_dga', userId: user.id, details: { commentaire } });
    await notifications.notifyRoleOnEntity(pr.entity_id, 'finances', 'Demande renvoyée par la DGA', `La demande ${pr.numero} a été renvoyée par la DGA : ${commentaire}. Le bon de commande a été annulé, merci de revoir et re-valider.`, `/purchase-requests/${prId}`);
    return getFullDetail(prId);
  }

  if (!(pr.status === 'en_validation' && pr.current_step_id)) {
    throw httpError(400, `Aucun refus possible depuis le statut "${pr.status}".`);
  }
  const template = await workflowEngine.getTemplate(MODULE_CODE);
  const steps = await workflowEngine.getSteps(template.id);
  const currentStep = steps.find(s => s.id === pr.current_step_id);
  const requiredRole = currentStep.role_code_requis;
  await assertRole(user, requiredRole, pr.entity_id, `refuser l'étape ${currentStep.code}`);

  if (currentStep.commentaire_obligatoire_si_refus && !commentaire) {
    throw httpError(400, 'Un commentaire est obligatoire pour refuser cette étape.');
  }

  const approval = await repo.getPendingApproval(prId, currentStep.id);
  if (!approval) throw httpError(500, 'Aucune validation en attente pour cette étape.');
  await repo.decideApproval(approval.id, 'refusee', user.id, commentaire);
  await audit.logAction({ tableName: 'approvals', recordId: approval.id, purchaseRequestId: prId, action: `refus_${currentStep.code}`, userId: user.id, details: { commentaire } });

  if (currentStep.comportement_si_refus === 'annulation') {
    await repo.updateStatusAndStep(prId, 'rejetee', null);
    await notifications.notify(pr.requester_user_id, 'Demande refusée', `Votre demande ${pr.numero} a été refusée : ${commentaire}`, `/purchase-requests/${prId}`);
    return getFullDetail(prId);
  }

  // retour_etape_precedente
  const returnStep = steps.find(s => s.code === currentStep.retour_step_code);
  if (!returnStep) throw httpError(500, 'retour_step_code non configuré pour cette étape.');
  await repo.updateStatusAndStep(prId, 'devis_selectionne', returnStep.id);
  await audit.logAction({ tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId, action: 'retour_service_achat', userId: user.id, details: { commentaire, depuis: currentStep.code } });
  await notifications.notifyRoleOnEntity(pr.entity_id, 'service_achat', 'Demande refusée — action requise', `La demande ${pr.numero} a été refusée par ${currentStep.nom} : ${commentaire}`, `/purchase-requests/${prId}`);
  return getFullDetail(prId);
}

async function generatePurchaseOrder(prId, userId) {
  const pr = await repo.getById(prId);
  const lines = await repo.getLines(prId);
  const supplierId = lines.find(l => l.fournisseur_retenu_id)?.fournisseur_retenu_id;
  if (!supplierId) throw httpError(500, 'Aucun fournisseur retenu sur cette demande.');

  // Instantané du mode & des conditions de paiement du fournisseur, repris sur le bon de commande.
  const sup = await one('SELECT mode_paiement, conditions_paiement FROM suppliers WHERE id = $1', [supplierId]);

  let po = await poRepo.create({
    purchaseRequestId: prId, numero: `PENDING-${prId}`, supplierId, montant: pr.montant_final, devise: pr.devise,
    modePaiement: sup?.mode_paiement || null, conditionsPaiement: sup?.conditions_paiement || null,
  });
  po = await poRepo.setNumero(po.id, numbering.formatOrderNumber(pr.entity_code, po.id));
  await audit.logAction({ tableName: 'purchase_orders', recordId: po.id, purchaseRequestId: prId, action: 'bon_commande_genere', userId, details: { numero: po.numero } });

  // Le BC est généré dès la validation Finances, MAIS la demande passe ensuite en validation DGA
  // finale (approuve/refuse). Repli sur l'ancien comportement (terminal) si l'étape décorative
  // validation_dga n'est pas configurée (déploiement avant migration 066).
  const template = await workflowEngine.getTemplate(MODULE_CODE);
  const dgaStep = await workflowEngine.getStepByCode(template.id, 'validation_dga');
  if (dgaStep) {
    await repo.updateStatusAndStep(prId, 'en_validation_dga', dgaStep.id);
    await notifications.notify(pr.requester_user_id, 'Bon de commande généré', `Votre demande ${pr.numero} : bon de commande ${po.numero} généré, en attente de la validation finale de la DGA.`, `/purchase-requests/${prId}`);
    await notifications.notifyRoleOnEntity(pr.entity_id, 'validateur_besoin', 'Validation DGA requise', `La demande ${pr.numero} (bon de commande ${po.numero}) attend votre validation finale.`, `/purchase-requests/${prId}`);
  } else {
    await repo.updateStatusAndStep(prId, 'bon_commande_genere', null);
    await notifications.notify(pr.requester_user_id, 'Bon de commande généré', `Votre demande ${pr.numero} est validée : bon de commande ${po.numero} généré.`, `/purchase-requests/${prId}`);
  }
  return getFullDetail(prId);
}

// Renvoyer pour complément à une étape AMONT choisie : demande de modification non bloquante (≠ refus),
// avec commentaire obligatoire, notification des titulaires de l'étape cible. Le circuit étant
// semi-codé en dur, on mappe l'étape cible vers le statut adéquat.
async function requestChanges(user, prId, { targetStepCode, comment }) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  if (!comment || !comment.trim()) throw httpError(400, 'Un commentaire est obligatoire pour une demande de complément.');
  const template = await workflowEngine.getTemplate(MODULE_CODE);
  const steps = await workflowEngine.getSteps(template.id);

  // Étape courante (ordre + rôle requis) selon le statut — même gating que validate/reject.
  let currentOrdre = null, currentRole = null;
  if (pr.status === 'en_validation' && pr.current_step_id) {
    const cur = steps.find(s => s.id === pr.current_step_id);
    currentOrdre = cur ? cur.ordre : null; currentRole = cur ? cur.role_code_requis : null;
  } else if (pr.status === 'en_validation_dga') {
    currentOrdre = steps.find(s => s.code === 'validation_dga')?.ordre ?? Infinity; currentRole = 'validateur_besoin';
  } else if (pr.status === 'devis_selectionne') {
    currentOrdre = steps.find(s => s.code === 'validation_achat')?.ordre ?? null; currentRole = 'service_achat';
  } else if (pr.status === 'en_attente_validation_besoin') {
    currentOrdre = steps.find(s => s.code === 'expression_besoin')?.ordre ?? null; currentRole = 'validateur_besoin';
  } else if (['soumise', 'en_analyse_achat'].includes(pr.status)) {
    // Phase de traitement achat AVANT sélection d'un devis : le service achat peut renvoyer pour
    // complément (ex. demande incomplète) vers une étape amont, sans avoir à traiter la demande.
    currentOrdre = steps.find(s => s.code === 'analyse_achat')?.ordre ?? null; currentRole = 'service_achat';
  } else if (pr.status === 'devis_en_cours') {
    currentOrdre = steps.find(s => s.code === 'devis')?.ordre ?? null; currentRole = 'service_achat';
  } else {
    throw httpError(400, `Aucune demande de complément possible depuis le statut "${pr.status}".`);
  }
  if (!currentRole) throw httpError(400, 'Étape courante indéterminée.');
  await assertRole(user, currentRole, pr.entity_id, 'renvoyer pour complément');

  const target = steps.find(s => s.code === targetStepCode);
  if (!target) throw httpError(400, 'Étape cible inconnue.');
  if (!target.role_code_requis || ['generation_bc', 'validation_dga'].includes(target.code)) throw httpError(400, 'Étape cible invalide.');
  if (currentOrdre != null && !(Number(target.ordre) < Number(currentOrdre))) throw httpError(400, 'On ne peut renvoyer que vers une étape en amont.');

  // Un bon de commande déjà généré (renvoi depuis la validation DGA) est annulé : on repart en amont.
  if (['en_validation_dga', 'bon_commande_genere'].includes(pr.status)) await poRepo.deleteByPurchaseRequestId(prId);
  await repo.deletePendingApprovals(prId); // les validations en attente en cours sont abandonnées

  const role = target.role_code_requis;
  let newStatus, newStepId = null, notifyRole = null, notifyRequester = false;
  if (target.code === 'expression_besoin') { newStatus = 'en_attente_validation_besoin'; notifyRole = 'validateur_besoin'; }
  else if (role === 'demandeur' || target.code === 'soumission') { newStatus = 'brouillon'; notifyRequester = true; }
  else if (role === 'service_achat') { newStatus = 'devis_en_cours'; notifyRole = 'service_achat'; }
  else { newStatus = 'en_validation'; newStepId = target.id; notifyRole = role; }

  await repo.updateStatusAndStep(prId, newStatus, newStepId);
  if (newStatus === 'en_validation') await repo.createApproval(prId, target.id);
  await audit.logAction({ tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId, action: 'demande_complement', userId: user.id, details: { commentaire: comment, etape_cible: target.nom } });

  const link = `/purchase-requests/${prId}`;
  const message = `La demande ${pr.numero} vous est renvoyée pour complément (${target.nom}) : ${comment}`;
  if (notifyRequester) await notifications.notify(pr.requester_user_id, 'Demande de complément', message, link);
  if (notifyRole) await notifications.notifyRoleOnEntity(pr.entity_id, notifyRole, 'Demande de complément', message, link);
  return getFullDetail(prId);
}

// Modifie la devise du bon de commande (reprise du devis retenu, ajustable par le service achat
// tant que le BC n'est pas généré). Pas de conversion : la devise est une étiquette.
const DEVISES_AUTORISEES = ['GNF', 'USD', 'EUR', 'XOF'];
async function updateDevise(user, prId, devise) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'modifier la devise');
  if (!DEVISES_AUTORISEES.includes(devise)) throw httpError(400, 'Devise invalide.');
  if (!['devis_selectionne', 'en_validation'].includes(pr.status)) {
    throw httpError(400, `La devise n'est plus modifiable depuis le statut "${pr.status}".`);
  }
  await one('UPDATE purchase_requests SET devise = $1, updated_at = now() WHERE id = $2', [devise, prId]);
  await audit.logAction({ tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId, action: 'changement_devise', userId: user.id, details: { devise } });
  return getFullDetail(prId);
}

async function listForUser(user, { entityId, status, mine, pendingAction, page = 1, pageSize = 20 }) {
  const pageOpts = { page, pageSize };
  if (pendingAction) {
    // Même logique que le calcul du tableau de bord (dashboard.service.js) : les demandes
    // qui attendent concrètement une action de CET utilisateur, pas juste "ses" demandes.
    const roleEntityPairs = (user.roles || [])
      .filter(r => r.role_code !== 'demandeur' && r.entity_id)
      .map(r => ({ roleCode: r.role_code, entityId: r.entity_id }));
    return repo.listPendingAction(roleEntityPairs, pageOpts);
  }
  if (mine) {
    return repo.list({ status, requesterId: user.id }, pageOpts);
  }
  if (entityId) {
    if (!hasAnyRoleOnEntity(user, entityId)) throw httpError(403, "Vous n'avez aucun rôle sur cette entité.");
    return repo.list({ status, entityId }, pageOpts);
  }
  if (isSuperAdmin(user)) {
    return repo.list({ status }, pageOpts);
  }
  // Pas de filtre explicite : montrer tout ce que l'utilisateur peut légitimement voir —
  // ses propres demandes partout, PLUS toutes les demandes des entités où il détient un
  // rôle de validation (service_achat/controle_gestion/finances/validateur_besoin), pas seulement les
  // siennes — sinon un valideur ne verrait jamais les demandes des autres à traiter.
  const visibleEntityIds = [...new Set(
    (user.roles || []).filter(r => r.role_code !== 'demandeur' && r.entity_id).map(r => r.entity_id)
  )];
  return repo.listVisibleTo({ status, requesterId: user.id, entityIds: visibleEntityIds }, pageOpts);
}

// Réception de commande : le demandeur (auteur de la DA) confirme, une fois le bon de commande
// généré, que la marchandise a bien été reçue. Statut inchangé — c'est un marqueur pour les KPI achats.
async function markReception(user, prId, { receptionnee, commentaire }) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  if (pr.requester_user_id !== user.id && !isSuperAdmin(user)) {
    throw httpError(403, 'Seul le demandeur peut confirmer la réception.');
  }
  if (pr.status !== 'bon_commande_genere') {
    throw httpError(400, 'La réception ne peut être confirmée qu\'une fois le bon de commande généré.');
  }
  const recu = !!receptionnee;
  await one(
    `UPDATE purchase_requests SET receptionnee = $1, reception_commentaire = $2,
       reception_at = $3, reception_by = $4, updated_at = now() WHERE id = $5`,
    [recu, commentaire || null, recu ? new Date() : null, recu ? user.id : null, prId]
  );
  await audit.logAction({
    tableName: 'purchase_requests', recordId: prId, purchaseRequestId: prId,
    action: recu ? 'reception_confirmee' : 'reception_annulee', userId: user.id, details: { commentaire: commentaire || null },
  });
  if (recu) {
    await notifications.notifyRoleOnEntity(pr.entity_id, 'service_achat', 'Commande réceptionnée',
      `La commande de la demande ${pr.numero} a été réceptionnée par le demandeur.`, `/purchase-requests/${prId}`);
  }
  return getFullDetail(prId);
}

// Export analytique : toutes les demandes des entités où l'utilisateur détient un rôle (toutes pour
// un super_admin), filtrées par plage de dates de création. Réservé aux valideurs (contrôle en route).
async function exportRows(user, { from, to }) {
  const entityIds = isSuperAdmin(user)
    ? null
    : [...new Set((user.roles || []).map(r => r.entity_id).filter(Boolean))];
  if (entityIds && entityIds.length === 0) return [];
  return repo.exportRows({ from, to, entityIds });
}

module.exports = {
  getFullDetail, getFullDetailForUser, createDraft, addLine, updateLine, deleteLine, submit,
  quickAddSupplier, createQuoteRequest, sendQuoteRequest, sendQuoteRequestToSupplier, getQuoteRequestSupplierPdf, addQuote, updateQuote, selectQuote,
  markSupplierConsulted, reopenConsultation, updateDevise,
  validateStep, rejectStep, requestChanges, listForUser, exportRows, markReception,
};
