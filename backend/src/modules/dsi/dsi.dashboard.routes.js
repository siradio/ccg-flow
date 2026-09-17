const express = require('express');
const { all, one } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');

const router = express.Router();
router.use(requireAuth);
const canView = requireSubModule('dsi.dashboard', 'consultation');

// Tableau de bord DSI — agrégats calculés (jamais figés). Filtres optionnels : entity_id, from, to.
router.get('/', canView, async (req, res, next) => {
  try {
    const entityId = req.query.entity_id ? Number(req.query.entity_id) : null;
    const buId = req.query.business_unit_id ? Number(req.query.business_unit_id) : null;
    const from = req.query.from || null;
    const to = req.query.to || null;
    // Filtre commun (entité + BU) construit dynamiquement, appliqué au parc et au support.
    const mkFilter = (alias) => {
      const cl = []; const params = [];
      if (entityId) { params.push(entityId); cl.push(`${alias}.entity_id = $${params.length}`); }
      if (buId) { params.push(buId); cl.push(`${alias}.business_unit_id = $${params.length}`); }
      return { and: cl.length ? 'AND ' + cl.join(' AND ') : '', params };
    };

    // ── Parc ──
    const ef = mkFilter('e');
    const parc = await one(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE statut='disponible')::int AS disponibles,
              COUNT(*) FILTER (WHERE statut='affecte')::int AS affectes,
              COUNT(*) FILTER (WHERE statut='en_maintenance')::int AS en_maintenance,
              COUNT(*) FILTER (WHERE statut='en_panne')::int AS en_panne,
              COUNT(*) FILTER (WHERE fin_garantie IS NOT NULL AND fin_garantie < CURRENT_DATE)::int AS hors_garantie,
              COALESCE(SUM(prix_achat) FILTER (WHERE statut<>'reforme'),0) AS valeur
       FROM dsi_equipment e WHERE deleted_at IS NULL ${ef.and}`, ef.params);
    const parcParCategorie = await all(
      `SELECT COALESCE(c.libelle,'—') AS label, COUNT(*)::int AS value
       FROM dsi_equipment e LEFT JOIN dsi_categories c ON c.id=e.category_id
       WHERE e.deleted_at IS NULL ${ef.and} GROUP BY c.libelle ORDER BY value DESC`, ef.params);
    const parcParEntite = await all(
      `SELECT ent.code AS label, COUNT(*)::int AS value
       FROM dsi_equipment e JOIN entities ent ON ent.id=e.entity_id
       WHERE e.deleted_at IS NULL GROUP BY ent.code ORDER BY value DESC`);
    const parcParBU = await all(
      `SELECT bu.nom AS label, COUNT(*)::int AS value
       FROM dsi_equipment e JOIN business_units bu ON bu.id=e.business_unit_id
       WHERE e.deleted_at IS NULL ${ef.and} GROUP BY bu.nom ORDER BY value DESC`, ef.params);

    // ── Support (tickets) ──
    const tf = mkFilter('t');
    const support = await one(
      `SELECT COUNT(*) FILTER (WHERE statut NOT IN ('resolu','cloture','annule'))::int AS ouverts,
              COUNT(*) FILTER (WHERE statut='en_cours')::int AS en_cours,
              COUNT(*) FILTER (WHERE statut='en_attente')::int AS en_attente,
              COUNT(*) FILTER (WHERE p.code='critique' AND statut NOT IN ('resolu','cloture','annule'))::int AS critiques,
              COUNT(*) FILTER (WHERE t.created_at::date=CURRENT_DATE)::int AS crees_aujourdhui,
              COUNT(*) FILTER (WHERE t.resolved_at::date=CURRENT_DATE)::int AS resolus_aujourdhui
       FROM dsi_tickets t LEFT JOIN dsi_priorities p ON p.id=t.priority_id WHERE 1=1 ${tf.and}`, tf.params);
    const ticketsParCategorie = await all(
      `SELECT COALESCE(tc.libelle,'—') AS label, COUNT(*)::int AS value
       FROM dsi_tickets t LEFT JOIN dsi_ticket_categories tc ON tc.id=t.category_id
       WHERE t.statut NOT IN ('cloture','annule') ${tf.and} GROUP BY tc.libelle ORDER BY value DESC`, tf.params);
    const ticketsParBU = await all(
      `SELECT bu.nom AS label, COUNT(*)::int AS value
       FROM dsi_tickets t JOIN business_units bu ON bu.id=t.business_unit_id
       WHERE t.statut NOT IN ('cloture','annule') ${tf.and} GROUP BY bu.nom ORDER BY value DESC`, tf.params);

    // Performance support (sur période si fournie, sinon tout) : SLA + délais moyens.
    const perfWhere = []; const perfParams = [];
    const PP = v => { perfParams.push(v); return `$${perfParams.length}`; };
    if (entityId) perfWhere.push(`t.entity_id = ${PP(entityId)}`);
    if (buId) perfWhere.push(`t.business_unit_id = ${PP(buId)}`);
    if (from) perfWhere.push(`t.resolved_at >= ${PP(from)}`);
    if (to) perfWhere.push(`t.resolved_at < (${PP(to)}::date + INTERVAL '1 day')`);
    perfWhere.push(`t.resolved_at IS NOT NULL`);
    const perf = await one(
      `SELECT COUNT(*)::int AS resolus,
              ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at))/60))::int AS mttr_min,
              ROUND(AVG(EXTRACT(EPOCH FROM (t.taken_at - t.created_at))/60) FILTER (WHERE t.taken_at IS NOT NULL))::int AS mtta_min,
              COUNT(*) FILTER (WHERE t.sla_resolution_min IS NOT NULL AND t.resolved_at <= t.created_at + (t.sla_resolution_min || ' minutes')::interval)::int AS dans_sla,
              COUNT(*) FILTER (WHERE t.sla_resolution_min IS NOT NULL)::int AS avec_sla
       FROM dsi_tickets t WHERE ${perfWhere.join(' AND ')}`, perfParams);
    const slaPct = perf.avec_sla ? Math.round((perf.dans_sla / perf.avec_sla) * 100) : null;

    // ── Maintenance ──
    const maintenance = await one(
      `SELECT COUNT(*) FILTER (WHERE statut='en_cours')::int AS en_cours,
              COUNT(*) FILTER (WHERE statut='planifiee')::int AS planifiees,
              COUNT(*) FILTER (WHERE statut='planifiee' AND date_debut < CURRENT_DATE)::int AS en_retard,
              COALESCE(SUM(cout),0) AS cout_total FROM dsi_maintenance`);

    // ── Projets ──
    const projets = await one(
      `SELECT COUNT(*) FILTER (WHERE statut='en_cours')::int AS actifs,
              COUNT(*) FILTER (WHERE statut='termine')::int AS termines,
              COUNT(*) FILTER (WHERE statut NOT IN ('termine','annule') AND date_fin_prevue < CURRENT_DATE)::int AS en_retard,
              COALESCE(ROUND(AVG(avancement_pct) FILTER (WHERE statut='en_cours')),0)::int AS avancement_moyen,
              COALESCE(SUM(budget_prevu),0) AS budget_prevu, COALESCE(SUM(budget_consomme),0) AS budget_consomme
       FROM dsi_projects WHERE deleted_at IS NULL`);

    // ── Risques ──
    const risques = await one(
      `SELECT COUNT(*) FILTER (WHERE statut<>'clos')::int AS ouverts,
              COUNT(*) FILTER (WHERE criticite='critique' AND statut<>'clos')::int AS critiques,
              COUNT(*) FILTER (WHERE criticite='eleve' AND statut<>'clos')::int AS eleves,
              COUNT(*) FILTER (WHERE statut<>'clos' AND echeance IS NOT NULL AND echeance < CURRENT_DATE)::int AS en_retard
       FROM dsi_risks`);

    // ── Indicateur de santé (règles par défaut sur KPI réels ; à rendre configurables au besoin) ──
    const lvl = (red, amber) => (red ? 'rouge' : amber ? 'orange' : 'vert');
    const health = {
      parc: lvl(parc.en_panne > 5, parc.hors_garantie > 0 || parc.en_panne > 0),
      support: lvl(support.critiques > 0, support.ouverts > 15),
      sla: slaPct == null ? 'vert' : lvl(slaPct < 75, slaPct < 90),
      maintenance: lvl(maintenance.en_retard > 0, maintenance.planifiees > 0),
      projets: lvl(projets.en_retard > 0, false),
      securite: lvl(risques.critiques > 0, risques.eleves > 0),
    };

    res.json({
      parc: { ...parc, parCategorie: parcParCategorie, parEntite: parcParEntite, parBU: parcParBU },
      support: { ...support, parCategorie: ticketsParCategorie, parBU: ticketsParBU },
      perf: { ...perf, sla_pct: slaPct },
      maintenance, projets, risques, health,
    });
  } catch (e) { next(e); }
});

module.exports = router;
