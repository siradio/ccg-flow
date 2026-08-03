const { one } = require('../../db');
const repo = require('./purchase-requests.repository');
const poRepo = require('../purchase-orders/purchase-orders.repository');
const suppliersService = require('../referentials/suppliers.service');
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
  return { ...pr, lines, quote_requests: quoteRequests, quotes, approvals, purchase_order: purchaseOrder, attachments };
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

async function createDraft(user, { entityId, siteId, objet, justification, devise }) {
  if (!hasAnyRoleOnEntity(user, entityId)) {
    throw httpError(403, "Vous n'avez aucun rôle sur cette entité.");
  }
  if (!objet) throw httpError(400, 'objet requis.');

  const template = await workflowEngine.getTemplate(MODULE_CODE);
  if (!template) throw httpError(500, 'Workflow "demande_achat" non configuré.');

  let pr = await repo.createDraft({
    entityId, workflowTemplateId: template.id, requesterId: user.id, siteId, objet, justification, devise,
  });
  pr = await repo.setNumero(pr.id, numbering.formatRequestNumber(await entityCode(entityId), pr.id));
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
  if (lines.length === 0) throw httpError(400, 'Impossible de soumettre une demande sans ligne.');

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
  if (!['soumise', 'en_analyse_achat'].includes(pr.status)) {
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

async function sendQuoteRequest(user, prId, quoteRequestId) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'envoyer la demande de devis');

  const qr = await repo.getQuoteRequest(quoteRequestId);
  const bodyText = qr?.message?.trim() || defaultQuoteRequestBody(pr.numero);
  const lines = await repo.getLines(prId);
  const suppliers = await repo.getQuoteRequestSuppliers(quoteRequestId);
  const results = [];
  for (const s of suppliers) {
    if (s.statut !== 'a_envoyer') { results.push({ supplierId: s.supplier_id, skipped: true }); continue; }
    try {
      const buffer = await pdf.generateQuoteRequestPdf({
        purchaseRequest: pr, lines, entityNom: pr.entity_nom, supplierNom: s.supplier_nom,
      });
      await mailer.sendMail({
        to: s.supplier_email,
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
  return pdf.generateQuoteRequestPdf({ purchaseRequest: pr, lines, entityNom: pr.entity_nom, supplierNom: supplier.supplier_nom });
}

async function addQuote(user, prId, { quoteRequestSupplierId, montant, devise, notes }, file) {
  const pr = await repo.getById(prId);
  if (!pr) throw httpError(404, 'Demande introuvable.');
  await assertRole(user, 'service_achat', pr.entity_id, 'saisir un devis reçu');
  if (pr.status !== 'devis_en_cours') throw httpError(400, `Action impossible depuis le statut "${pr.status}".`);
  if (!montant) throw httpError(400, 'montant requis.');

  const quote = await repo.createQuote(quoteRequestSupplierId, montant, devise || pr.devise, notes);
  await audit.logAction({ tableName: 'quotes', recordId: quote.id, purchaseRequestId: prId, action: 'quote_received', userId: user.id, details: { montant, devise } });
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

  const selected = await repo.selectQuote(quoteId, prId);
  if (!selected) throw httpError(404, 'Devis introuvable.');
  const quote = await repo.getQuote(quoteId);
  await repo.setLinesFournisseurRetenu(prId, quote.supplier_id);
  await repo.setLinesPrixUnitaireFinal(prId, quote.montant);
  await repo.setMontantFinal(prId, quote.montant, quote.devise);
  await repo.updateStatusAndStep(prId, 'devis_selectionne', null);
  await audit.logAction({ tableName: 'quotes', recordId: quoteId, purchaseRequestId: prId, action: 'quote_selected', userId: user.id, details: { supplier: quote.supplier_nom, montant: quote.montant } });
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

  let po = await poRepo.create({
    purchaseRequestId: prId, numero: `PENDING-${prId}`, supplierId, montant: pr.montant_final, devise: pr.devise,
  });
  po = await poRepo.setNumero(po.id, numbering.formatOrderNumber(pr.entity_code, po.id));
  await repo.updateStatusAndStep(prId, 'bon_commande_genere', null);
  await audit.logAction({ tableName: 'purchase_orders', recordId: po.id, purchaseRequestId: prId, action: 'bon_commande_genere', userId, details: { numero: po.numero } });
  await notifications.notify(pr.requester_user_id, 'Bon de commande généré', `Votre demande ${pr.numero} est validée : bon de commande ${po.numero} généré.`, `/purchase-requests/${prId}`);
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

module.exports = {
  getFullDetail, getFullDetailForUser, createDraft, addLine, updateLine, deleteLine, submit,
  quickAddSupplier, createQuoteRequest, sendQuoteRequest, getQuoteRequestSupplierPdf, addQuote, selectQuote,
  validateStep, rejectStep, listForUser,
};
