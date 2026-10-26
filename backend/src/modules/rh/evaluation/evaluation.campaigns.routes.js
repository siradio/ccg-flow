const express = require('express');
const { all, one, run, withTransaction } = require('../../../db');
const { requireAuth } = require('../../../middleware/auth');
const { isSuperAdmin } = require('../../../middleware/permissions');
const { logAction } = require('../../audit/audit.service');
const { nextRef } = require('../../dsi/dsi.numbering');
const { notify } = require('../../notifications/notifications.service');

// Campagnes d'évaluation — ouvertes et clôturées par les RH. Les managers les consultent pour
// rattacher les fiches de leur équipe.
const router = express.Router();
router.use(requireAuth);
const isRh = (u) => isSuperAdmin(u) || (u.roles || []).some(r => r.role_code === 'rh');
function requireRh(req, res, next) { if (!isRh(req.user)) return res.status(403).json({ error: 'Réservé aux RH.' }); next(); }

router.get('/', async (req, res, next) => {
  try {
    const where = []; const params = [];
    if (req.query.statut) { params.push(req.query.statut); where.push(`c.statut = $${params.length}`); }
    const rows = await all(`
      SELECT c.*, t.nom AS template_defaut_nom,
             (SELECT COUNT(*)::int FROM rh_evaluations e WHERE e.campaign_id = c.id) AS nb_fiches
        FROM rh_eval_campaigns c LEFT JOIN rh_eval_templates t ON t.id = c.template_defaut_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY c.annee DESC, c.id DESC`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', requireRh, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.libelle || !b.libelle.trim()) return res.status(400).json({ error: 'Le libellé est obligatoire.' });
    if (!b.annee) return res.status(400).json({ error: "L'année est obligatoire." });
    const row = await one(
      `INSERT INTO rh_eval_campaigns (libelle, annee, date_debut, date_fin, echelle_max, template_defaut_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.libelle.trim(), Number(b.annee), b.date_debut || null, b.date_fin || null, Number(b.echelle_max) || 5, b.template_defaut_id || null, req.user.id]);
    await logAction({ tableName: 'rh_eval_campaigns', recordId: row.id, action: 'creation', userId: req.user.id, details: { libelle: b.libelle } });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', requireRh, async (req, res, next) => {
  try {
    const id = Number(req.params.id); const b = req.body || {};
    const ex = await one('SELECT * FROM rh_eval_campaigns WHERE id = $1', [id]);
    if (!ex) return res.status(404).json({ error: 'Campagne introuvable.' });
    await run(
      `UPDATE rh_eval_campaigns SET libelle=$1, annee=$2, date_debut=$3, date_fin=$4, echelle_max=$5, template_defaut_id=$6, statut=$7 WHERE id=$8`,
      [(b.libelle && b.libelle.trim()) || ex.libelle, Number(b.annee) || ex.annee, b.date_debut ?? ex.date_debut,
       b.date_fin ?? ex.date_fin, Number(b.echelle_max) || ex.echelle_max, b.template_defaut_id ?? ex.template_defaut_id,
       (b.statut === 'ouverte' || b.statut === 'close') ? b.statut : ex.statut, id]);
    res.json(await one('SELECT * FROM rh_eval_campaigns WHERE id = $1', [id]));
  } catch (e) { next(e); }
});

// Employés éligibles à la génération d'une campagne : actifs, ayant un manager. Expose des
// indicateurs (manager avec compte, fiche déjà créée dans la campagne) pour une sélection ciblée
// côté UI — l'évaluation ne concerne pas forcément tout le monde (un modèle = certains métiers).
router.get('/:id/eligibles', requireRh, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const camp = await one('SELECT id FROM rh_eval_campaigns WHERE id = $1', [id]);
    if (!camp) return res.status(404).json({ error: 'Campagne introuvable.' });
    const rows = await all(`
      SELECT e.id, e.matricule, e.prenom, e.nom, e.poste, e.business_unit_id,
             bu.nom AS business_unit_nom,
             TRIM(CONCAT(me.prenom,' ',me.nom)) AS manager_nom,
             (mu.id IS NOT NULL) AS manager_a_compte,
             EXISTS (SELECT 1 FROM rh_evaluations ev WHERE ev.campaign_id = $1 AND ev.employee_id = e.id) AS deja_fiche
        FROM employees e
        LEFT JOIN business_units bu ON bu.id = e.business_unit_id
        LEFT JOIN employees me ON me.id = e.manager_employee_id
        LEFT JOIN users mu ON mu.employee_id = e.manager_employee_id AND mu.actif = true
       WHERE e.statut = 'actif' AND e.manager_employee_id IS NOT NULL
       ORDER BY e.poste NULLS LAST, e.nom, e.prenom`, [id]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Génération en masse des fiches d'une campagne : une fiche BROUILLON par employé actif ayant un
// manager (compte lié), à partir du modèle de la campagne (ou fourni). Les fiches déjà créées pour
// cet employé dans la campagne sont ignorées. Chaque manager est notifié une fois.
router.post('/:id/generate', requireRh, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const camp = await one('SELECT * FROM rh_eval_campaigns WHERE id = $1', [id]);
    if (!camp) return res.status(404).json({ error: 'Campagne introuvable.' });
    if (camp.statut !== 'ouverte') return res.status(409).json({ error: 'La campagne est close.' });
    const templateId = Number(req.body && req.body.template_id) || camp.template_defaut_id;
    if (!templateId) return res.status(400).json({ error: 'Aucun modèle : définissez un modèle par défaut sur la campagne ou fournissez-en un.' });
    const tpl = await one('SELECT * FROM rh_eval_templates WHERE id = $1', [templateId]);
    if (!tpl) return res.status(400).json({ error: 'Modèle introuvable.' });
    const items = await all('SELECT * FROM rh_eval_template_items WHERE template_id = $1 ORDER BY ordre, id', [templateId]);

    const b = req.body || {};
    const ids = Array.isArray(b.employee_ids) ? b.employee_ids.map(Number).filter(Boolean) : null;
    let emps;
    if (ids && ids.length) {
      emps = await all('SELECT id, entity_id, business_unit_id FROM employees WHERE id = ANY($1)', [ids]);
    } else {
      const where = ["statut = 'actif'", 'manager_employee_id IS NOT NULL']; const params = [];
      if (b.business_unit_id) { params.push(Number(b.business_unit_id)); where.push(`business_unit_id = $${params.length}`); }
      if (b.entity_id) { params.push(Number(b.entity_id)); where.push(`entity_id = $${params.length}`); }
      emps = await all(`SELECT id, entity_id, business_unit_id FROM employees WHERE ${where.join(' AND ')}`, params);
    }

    const echelle = camp.echelle_max || tpl.echelle_max || 5;
    const report = { total: emps.length, created: 0, skipped: 0, errors: [] };
    const managerCounts = new Map();
    for (const emp of emps) {
      try {
        const exists = await one('SELECT 1 FROM rh_evaluations WHERE campaign_id = $1 AND employee_id = $2', [id, emp.id]);
        if (exists) { report.skipped += 1; continue; }
        const mgr = await one(`SELECT u.id FROM employees e JOIN users u ON u.employee_id = e.manager_employee_id AND u.actif = true WHERE e.id = $1 LIMIT 1`, [emp.id]);
        if (!mgr) { report.skipped += 1; report.errors.push({ employee_id: emp.id, motif: 'Manager non configuré ou sans compte' }); continue; }
        const euid = await one('SELECT id FROM users WHERE employee_id = $1 AND actif = true LIMIT 1', [emp.id]);
        await withTransaction(async (tx) => {
          const numero = await nextRef(tx, { scope: 'rh_evaluation', prefix: 'EVL', pad: 4 });
          const row = await tx.one(
            `INSERT INTO rh_evaluations (numero, campaign_id, employee_id, manager_user_id, template_id, entity_id, business_unit_id, annee, echelle_max, statut, auto_par_manager, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'brouillon',$10,$11) RETURNING id`,
            [numero, id, emp.id, mgr.id, templateId, emp.entity_id, emp.business_unit_id, camp.annee, echelle, euid == null, req.user.id]);
          for (const it of items) {
            await tx.run(`INSERT INTO rh_evaluation_lignes (evaluation_id, competence_id, categorie_libelle, libelle, ordre) VALUES ($1,$2,$3,$4,$5)`,
              [row.id, it.competence_id, it.categorie_libelle, it.libelle, it.ordre]);
          }
          await tx.run(`INSERT INTO rh_evaluation_history (evaluation_id, action, user_id) VALUES ($1,'creation',$2)`, [row.id, req.user.id]);
        });
        report.created += 1;
        managerCounts.set(mgr.id, (managerCounts.get(mgr.id) || 0) + 1);
      } catch (err) { report.skipped += 1; report.errors.push({ employee_id: emp.id, motif: err.message }); }
    }
    // Notifie chaque manager une fois.
    for (const [mgrId, n] of managerCounts) {
      try { await notify(mgrId, 'Évaluations à préparer', `${n} fiche(s) d'évaluation ont été générées pour votre équipe (campagne ${camp.libelle}).`, '/rh/evaluation/fiches'); } catch (e) { /* non bloquant */ }
    }
    await logAction({ tableName: 'rh_eval_campaigns', recordId: id, action: 'generation_fiches', userId: req.user.id, details: report });
    res.json(report);
  } catch (e) { next(e); }
});

module.exports = router;
