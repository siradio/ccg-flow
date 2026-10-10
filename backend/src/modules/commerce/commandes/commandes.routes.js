const express = require('express');
const { all, one, withTransaction } = require('../../../db');
const { requireAuth } = require('../../../middleware/auth');
const { requireSubModule, requireSubModuleWrite, isSuperAdmin } = require('../../../middleware/permissions');
const { logAction } = require('../../audit/audit.service');
const { nextRef } = require('../../dsi/dsi.numbering');
const workflow = require('./commande.workflow');
const commandePdf = require('./commande.pdf');

// Bons de commande commerciaux — saisie (Lot 2). Deux formulaires (Yaourt = casiers,
// Divers = cartons) partageant un modèle. Recalcul des montants et gel des prix CÔTÉ SERVEUR :
// le client ne fixe jamais un prix. Le workflow (validations, contrôle stock, PDF) arrive au Lot 3.
const router = express.Router();
router.use(requireAuth, requireSubModule('commerce.commandes'));
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('commerce.commandes');

const UNITE_BY_TYPE = { yaourt: 'casier', divers: 'carton' };
const err400 = (msg) => { const e = new Error(msg); e.status = 400; return e; };

async function getSetting(cle, def) {
  const row = await one(`SELECT valeur FROM commerce_settings WHERE cle = $1 AND business_unit_id IS NULL`, [cle]);
  return row ? row.valeur : def;
}

// BU (ids) d'un type de formulaire, depuis le mapping configurable (codes) — migration 096.
async function formBuIds(type) {
  const valeur = await getSetting(type === 'yaourt' ? 'bc_bu_codes_yaourt' : 'bc_bu_codes_divers', '');
  const codes = String(valeur || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!codes.length) return [];
  const bus = await all(`SELECT id FROM business_units WHERE code = ANY($1)`, [codes]);
  return bus.map(b => b.id);
}

// Recalcule les lignes (prix figés depuis les tarifs ACTIFS) + les totaux. Lecture seule, déterministe.
async function computeLines(type, beneficiaireType, inputLines) {
  const unite = UNITE_BY_TYPE[type];
  const categorie = beneficiaireType === 'grossiste' ? 'grossiste' : 'commercial';
  const seen = new Set();
  const lines = [];
  let montant = 0, casiers = 0, cartons = 0;
  for (const l of (inputLines || [])) {
    const pid = Number(l.product_id);
    const qte = Number(l.quantite);
    if (!pid || qte === 0 || l.quantite === '' || l.quantite == null) continue; // qté 0/vide → pas de ligne
    if (!Number.isInteger(qte)) throw err400('Quantité invalide : nombre entier requis.');
    if (qte < 0) throw err400('Quantité négative interdite.');
    if (seen.has(pid)) throw err400('Produit en double dans la commande.');
    seen.add(pid);
    const prod = await one(`SELECT id, designation, business_unit_id FROM products WHERE id = $1 AND type_article = 'produit_fini'`, [pid]);
    if (!prod) throw err400(`Produit ${pid} introuvable ou non « produit fini ».`);
    const tarif = await one(`SELECT id, prix FROM commande_tarifs WHERE product_id = $1 AND categorie_tarif = $2 AND actif`, [pid, categorie]);
    if (!tarif) throw err400(`Tarif ${categorie} manquant pour « ${prod.designation} ».`);
    const prix = Number(tarif.prix);
    const montantLigne = Math.round(prix * qte * 10000) / 10000;
    montant += montantLigne;
    if (unite === 'casier') casiers += qte; else cartons += qte;
    lines.push({
      product_id: pid, libelle_fige: prod.designation, business_unit_id: prod.business_unit_id,
      unite, quantite: qte, categorie_tarif: categorie,
      prix_unitaire_fige: prix, montant_ligne: montantLigne, tarif_source_id: tarif.id,
    });
  }
  return { unite, categorie, lines, montant_total: montant, total_casiers: casiers, total_cartons: cartons };
}

// Capacité + taux de remplissage pour l'unité du formulaire.
async function fillRate(vehicleId, unite, qty) {
  if (!vehicleId) return { capacite: null, taux: null };
  const v = await one(`SELECT capacite_casiers, capacite_cartons FROM vehicles WHERE id = $1`, [Number(vehicleId)]);
  if (!v) return { capacite: null, taux: null };
  const cap = unite === 'casier' ? v.capacite_casiers : v.capacite_cartons;
  if (!cap || cap <= 0) return { capacite: null, taux: null };
  return { capacite: cap, taux: Math.round((qty / cap) * 10000) / 100 };
}

const DETAIL_SELECT = `
  SELECT c.*,
         co.code AS commercial_code, TRIM(CONCAT(COALESCE(ce.prenom, co.prenom), ' ', COALESCE(ce.nom, co.nom))) AS commercial_nom,
         g.code AS grossiste_code, g.raison_sociale AS grossiste_nom,
         bu.nom AS business_unit_nom,
         v.immatriculation AS vehicle_immatriculation, v.marque AS vehicle_marque,
         v.capacite_casiers AS vehicle_capacite_casiers, v.capacite_cartons AS vehicle_capacite_cartons,
         TRIM(CONCAT(u.prenom, ' ', u.nom)) AS created_by_nom
    FROM commandes_commerciales c
    LEFT JOIN commerciaux co   ON co.id = c.commercial_id
    LEFT JOIN employees ce     ON ce.id = co.employee_id
    LEFT JOIN grossistes g     ON g.id = c.grossiste_id
    LEFT JOIN business_units bu ON bu.id = c.business_unit_id
    LEFT JOIN vehicles v       ON v.id = c.vehicle_id
    LEFT JOIN users u          ON u.id = c.created_by`;

// Liste. Par défaut « mes commandes » ; filtres statut / type / mine.
router.get('/', async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.mine === '1') { params.push(req.user.id); where.push(`c.created_by = $${params.length}`); }
    // File « Mes validations » : bons en cours dont l'étape courante requiert un rôle que je détiens.
    if (req.query.a_valider === '1') {
      where.push(`c.statut = 'en_validation'`);
      if (!isSuperAdmin(req.user)) {
        const roles = [...new Set((req.user.roles || []).map(r => r.role_code))];
        if (roles.length === 0) return res.json([]);
        params.push(roles);
        where.push(`EXISTS (SELECT 1 FROM workflow_steps ws WHERE ws.id = c.current_step_id AND ws.role_code_requis = ANY($${params.length}))`);
      }
    }
    if (req.query.statut) { params.push(req.query.statut); where.push(`c.statut = $${params.length}`); }
    if (req.query.type) { params.push(req.query.type); where.push(`c.type_formulaire = $${params.length}`); }
    const sql = DETAIL_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY c.created_at DESC';
    res.json(await all(sql, params));
  } catch (e) { next(e); }
});

// Catalogue d'un formulaire : produits finis des BU concernées + tarifs actifs (2 catégories).
router.get('/catalogue', async (req, res, next) => {
  try {
    const type = req.query.type === 'yaourt' ? 'yaourt' : 'divers';
    const buIds = await formBuIds(type);
    if (!buIds.length) return res.json({ unite: UNITE_BY_TYPE[type], products: [] });
    const products = await all(`
      SELECT p.id AS product_id, p.code, p.designation, p.business_unit_id, bu.nom AS business_unit_nom,
             tc.prix AS prix_commercial, tg.prix AS prix_grossiste
        FROM products p
        LEFT JOIN business_units bu ON bu.id = p.business_unit_id
        LEFT JOIN commande_tarifs tc ON tc.product_id = p.id AND tc.categorie_tarif = 'commercial' AND tc.actif
        LEFT JOIN commande_tarifs tg ON tg.product_id = p.id AND tg.categorie_tarif = 'grossiste'  AND tg.actif
       WHERE p.type_article = 'produit_fini' AND p.actif AND p.business_unit_id = ANY($1)
       ORDER BY bu.nom NULLS LAST, p.designation`, [buIds]);
    res.json({ unite: UNITE_BY_TYPE[type], products });
  } catch (e) { next(e); }
});

// Tableau de bord : agrégats (filtres période / type / BU).
router.get('/stats', async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.from) { params.push(req.query.from); where.push(`c.created_at >= $${params.length}`); }
    if (req.query.to) { params.push(req.query.to); where.push(`c.created_at <= ($${params.length}::date + 1)`); }
    if (req.query.type) { params.push(req.query.type); where.push(`c.type_formulaire = $${params.length}`); }
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`c.business_unit_id = $${params.length}`); }
    const W = where.length ? ' WHERE ' + where.join(' AND ') : '';

    const totaux = await one(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE statut='brouillon')::int     AS brouillon,
             COUNT(*) FILTER (WHERE statut='en_validation')::int AS en_validation,
             COUNT(*) FILTER (WHERE statut='valide')::int        AS valide,
             COUNT(*) FILTER (WHERE statut='rejetee')::int       AS rejetee,
             COUNT(*) FILTER (WHERE statut='annulee')::int       AS annulee,
             COALESCE(SUM(montant_total) FILTER (WHERE statut NOT IN ('annulee','rejetee')),0) AS montant_total,
             COALESCE(SUM(total_casiers),0)::int AS casiers,
             COALESCE(SUM(total_cartons),0)::int AS cartons,
             AVG(EXTRACT(EPOCH FROM (updated_at - submitted_at))/86400.0)
               FILTER (WHERE statut='valide' AND submitted_at IS NOT NULL) AS delai_moyen_jours
        FROM commandes_commerciales c ${W}`, params);

    const parType = await all(`
      SELECT c.type_formulaire AS type, COUNT(*)::int AS count,
             COALESCE(SUM(c.montant_total) FILTER (WHERE statut NOT IN ('annulee','rejetee')),0) AS montant
        FROM commandes_commerciales c ${W} GROUP BY c.type_formulaire ORDER BY c.type_formulaire`, params);

    const parEtape = await all(`
      SELECT ws.code, ws.nom, COUNT(*)::int AS count
        FROM commandes_commerciales c JOIN workflow_steps ws ON ws.id = c.current_step_id
       ${W ? W + ' AND' : ' WHERE'} c.statut='en_validation'
       GROUP BY ws.code, ws.nom, ws.ordre ORDER BY ws.ordre`, params);

    const parBu = await all(`
      SELECT bu.nom AS business_unit_nom, COUNT(*)::int AS count,
             COALESCE(SUM(c.montant_total) FILTER (WHERE statut NOT IN ('annulee','rejetee')),0) AS montant
        FROM commandes_commerciales c LEFT JOIN business_units bu ON bu.id = c.business_unit_id
       ${W} GROUP BY bu.nom ORDER BY count DESC`, params);

    res.json({ totaux, parType, parEtape, parBu });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await one(DETAIL_SELECT + ' WHERE c.id = $1', [Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Commande introuvable.' });
    row.lignes = await all(
      `SELECT l.*, bu.nom AS business_unit_nom FROM commande_lignes l
         LEFT JOIN business_units bu ON bu.id = l.business_unit_id
        WHERE l.commande_id = $1 ORDER BY l.id`, [row.id]);
    res.json(row);
  } catch (e) { next(e); }
});

function validateHeader(b) {
  if (!['yaourt', 'divers'].includes(b.type_formulaire)) throw err400('Type de formulaire invalide.');
  if (!['commercial', 'grossiste'].includes(b.beneficiaire_type)) throw err400('Type de bénéficiaire invalide.');
  if (b.beneficiaire_type === 'commercial' && !b.commercial_id) throw err400('Commercial bénéficiaire obligatoire.');
  if (b.beneficiaire_type === 'grossiste' && !b.grossiste_id) throw err400('Grossiste bénéficiaire obligatoire.');
}

async function writeLines(tx, commandeId, lines) {
  await tx.run('DELETE FROM commande_lignes WHERE commande_id = $1', [commandeId]);
  for (const l of lines) {
    await tx.run(
      `INSERT INTO commande_lignes
         (commande_id, product_id, libelle_fige, business_unit_id, unite, quantite, categorie_tarif, prix_unitaire_fige, montant_ligne, tarif_source_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [commandeId, l.product_id, l.libelle_fige, l.business_unit_id, l.unite, l.quantite, l.categorie_tarif, l.prix_unitaire_fige, l.montant_ligne, l.tarif_source_id]);
  }
}

// Création d'un brouillon.
router.post('/', requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    validateHeader(b);
    const computed = await computeLines(b.type_formulaire, b.beneficiaire_type, b.lines);
    const qty = computed.unite === 'casier' ? computed.total_casiers : computed.total_cartons;
    const { capacite, taux } = await fillRate(b.vehicle_id, computed.unite, qty);
    const id = await withTransaction(async (tx) => {
      const row = await tx.one(
        `INSERT INTO commandes_commerciales
           (type_formulaire, beneficiaire_type, commercial_id, grossiste_id, entity_id, business_unit_id,
            vehicle_id, capacite_figee, statut, montant_total, total_casiers, total_cartons, taux_remplissage, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'brouillon',$9,$10,$11,$12,$13) RETURNING id`,
        [b.type_formulaire, b.beneficiaire_type,
         b.beneficiaire_type === 'commercial' ? Number(b.commercial_id) : null,
         b.beneficiaire_type === 'grossiste' ? Number(b.grossiste_id) : null,
         b.entity_id || null, b.business_unit_id || null, b.vehicle_id || null, capacite,
         computed.montant_total, computed.total_casiers, computed.total_cartons, taux, req.user.id]);
      await writeLines(tx, row.id, computed.lines);
      return row.id;
    });
    await logAction({ tableName: 'commandes_commerciales', recordId: id, action: 'creation', userId: req.user.id, details: { type: b.type_formulaire } });
    res.status(201).json(await one(DETAIL_SELECT + ' WHERE c.id = $1', [id]));
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// Mise à jour d'un brouillon (uniquement en brouillon : un bon soumis est figé).
router.put('/:id', requireEdit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT * FROM commandes_commerciales WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Commande introuvable.' });
    if (existing.statut !== 'brouillon') return res.status(409).json({ error: 'Seul un brouillon peut être modifié.' });
    const b = { ...existing, ...req.body };
    validateHeader(b);
    const computed = await computeLines(b.type_formulaire, b.beneficiaire_type, req.body.lines);
    const qty = computed.unite === 'casier' ? computed.total_casiers : computed.total_cartons;
    const vehicleId = 'vehicle_id' in req.body ? req.body.vehicle_id : existing.vehicle_id;
    const { capacite, taux } = await fillRate(vehicleId, computed.unite, qty);
    await withTransaction(async (tx) => {
      await tx.run(
        `UPDATE commandes_commerciales SET
           type_formulaire=$1, beneficiaire_type=$2, commercial_id=$3, grossiste_id=$4,
           business_unit_id=$5, vehicle_id=$6, capacite_figee=$7,
           montant_total=$8, total_casiers=$9, total_cartons=$10, taux_remplissage=$11,
           updated_at=now() WHERE id=$12`,
        [b.type_formulaire, b.beneficiaire_type,
         b.beneficiaire_type === 'commercial' ? Number(b.commercial_id) : null,
         b.beneficiaire_type === 'grossiste' ? Number(b.grossiste_id) : null,
         b.business_unit_id || null, vehicleId || null, capacite,
         computed.montant_total, computed.total_casiers, computed.total_cartons, taux, id]);
      await writeLines(tx, id, computed.lines);
    });
    await logAction({ tableName: 'commandes_commerciales', recordId: id, action: 'modification', userId: req.user.id, details: {} });
    res.json(await one(DETAIL_SELECT + ' WHERE c.id = $1', [id]));
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// Soumission : contrôles (au moins une qté positive, dépassement bloqué, motif si sous-charge),
// attribution du numéro, entrée dans le circuit de validation à la 1re étape.
router.post('/:id/submit', requireEdit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const c = await one('SELECT * FROM commandes_commerciales WHERE id = $1', [id]);
    if (!c) return res.status(404).json({ error: 'Commande introuvable.' });
    if (c.statut !== 'brouillon') return res.status(409).json({ error: 'Commande déjà soumise.' });

    // Re-fige les prix depuis les lignes stockées (prix du moment de la soumission).
    const stored = await all('SELECT product_id, quantite FROM commande_lignes WHERE commande_id = $1', [id]);
    const computed = await computeLines(c.type_formulaire, c.beneficiaire_type, stored);
    if (computed.lines.length === 0) return res.status(400).json({ error: 'Au moins une quantité positive est requise.' });

    const qty = computed.unite === 'casier' ? computed.total_casiers : computed.total_cartons;
    const { capacite, taux } = await fillRate(c.vehicle_id, computed.unite, qty);
    if (taux != null && taux > 100) {
      return res.status(400).json({ error: `Charge (${qty}) supérieure à la capacité du véhicule (${capacite}). Réduisez la quantité ou changez de véhicule.` });
    }
    const seuil = Number(await getSetting('bc_remplissage_seuil', '100'));
    const motif = (req.body && req.body.motif_sous_charge) || null;
    if (taux != null && taux < seuil && !motif) {
      return res.status(400).json({ error: `Remplissage ${taux}% < seuil ${seuil}%. Un motif de sous-charge est obligatoire.`, code: 'motif_requis', taux, seuil });
    }

    const tpl = await one(`SELECT id FROM workflow_templates WHERE module_code = 'bon_commande_commercial' AND actif`);
    const step1 = tpl ? await one(`SELECT id, code, nom, role_code_requis FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY ordre LIMIT 1`, [tpl.id]) : null;

    const numero = await withTransaction(async (tx) => {
      const num = await nextRef(tx, { scope: 'bon_commande_commercial', prefix: 'BC-COM', pad: 4 });
      await tx.run(
        `UPDATE commandes_commerciales SET
           numero=$1, statut='en_validation', workflow_template_id=$2, current_step_id=$3,
           capacite_figee=$4, taux_remplissage=$5, motif_sous_charge=$6, submitted_at=now(), updated_at=now()
         WHERE id=$7`,
        [num, tpl ? tpl.id : null, step1 ? step1.id : null, capacite, taux, motif, id]);
      // Ouvre la 1re étape du circuit (ligne de validation « en attente ») dans la même transaction.
      if (step1 && step1.role_code_requis) {
        await workflow.openFirstStep(tx, { ...c, numero: num, montant_total: computed.montant_total }, step1, computed.lines, req.user.id);
      }
      return num;
    });
    await logAction({ tableName: 'commandes_commerciales', recordId: id, action: 'soumission', userId: req.user.id, details: { numero } });
    if (step1 && step1.role_code_requis) {
      try { await workflow.notifyRole(step1.role_code_requis, 'Bon de commande', `Nouveau bon ${numero} à valider (${step1.nom}).`, `/commerce/commandes/${id}`); } catch (e) { /* non bloquant */ }
    }
    res.json(await one(DETAIL_SELECT + ' WHERE c.id = $1', [id]));
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// Suppression d'un brouillon.
router.delete('/:id', requireEdit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const c = await one('SELECT statut FROM commandes_commerciales WHERE id = $1', [id]);
    if (!c) return res.status(404).json({ error: 'Commande introuvable.' });
    if (c.statut !== 'brouillon') return res.status(409).json({ error: 'Seul un brouillon peut être supprimé.' });
    await withTransaction(async (tx) => { await tx.run('DELETE FROM commandes_commerciales WHERE id = $1', [id]); });
    await logAction({ tableName: 'commandes_commerciales', recordId: id, action: 'suppression', userId: req.user.id, details: {} });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Téléchargement du bon de commande PDF (généré à la validation complète ; régénéré si absent).
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const c = await one('SELECT numero, statut FROM commandes_commerciales WHERE id = $1', [id]);
    if (!c) return res.status(404).json({ error: 'Commande introuvable.' });
    let doc = await commandePdf.getStored(id);
    if (!doc || !doc.contenu) {
      if (c.statut !== 'valide') return res.status(409).json({ error: 'Le bon de commande PDF est disponible après validation complète.' });
      await commandePdf.generateAndStore(id, req.user.id);
      doc = await commandePdf.getStored(id);
    }
    if (!doc || !doc.contenu) return res.status(404).json({ error: 'Document indisponible.' });
    res.setHeader('Content-Type', doc.mime || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(c.numero || 'BC_' + id).replace(/\s+/g, '_')}.pdf"`);
    res.send(doc.contenu);
  } catch (e) { next(e); }
});

// ── Workflow ────────────────────────────────────────────────────────────────
router.get('/:id/workflow', async (req, res, next) => {
  try {
    const wf = await workflow.getWorkflow(Number(req.params.id));
    if (!wf) return res.status(404).json({ error: 'Commande introuvable.' });
    res.json(wf);
  } catch (e) { next(e); }
});

const action = (fn) => async (req, res, next) => {
  try {
    const out = await fn(Number(req.params.id), req.user, req.body || {});
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
};

router.post('/:id/validate', action(workflow.validateStep));
router.post('/:id/stock-confirm', action(workflow.confirmStock));
router.post('/:id/return', action(workflow.returnStep));
router.post('/:id/cancel', action(workflow.cancelOrder));

module.exports = router;
