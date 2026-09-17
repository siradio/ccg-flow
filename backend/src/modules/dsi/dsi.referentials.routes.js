// Référentiels DSI — CRUD génériques (réutilise crud.factory + le sous-module dsi.referentiels).
// Montés sous /api/dsi/referentials/<nom>. Lecture ouverte à tout authentifié ; écriture au niveau
// ajout/edition du sous-module dsi.referentiels.
const express = require('express');
const { simpleCrudRouter } = require('../referentials/crud.factory');

const router = express.Router();
const SUB = 'dsi.referentiels';
const lookup = ['code', 'libelle', 'actif', 'ordre'];

router.use('/categories', simpleCrudRouter({
  table: 'dsi_categories', columns: lookup, orderBy: 'ordre, libelle', subModuleKey: SUB,
}));
router.use('/types', simpleCrudRouter({
  table: 'dsi_types', columns: ['category_id', 'code', 'libelle', 'actif', 'ordre'],
  filterColumn: 'category_id', orderBy: 'ordre, libelle', subModuleKey: SUB,
}));
router.use('/brands', simpleCrudRouter({
  table: 'dsi_brands', columns: ['nom', 'actif'], orderBy: 'nom', subModuleKey: SUB,
}));
router.use('/ticket-categories', simpleCrudRouter({
  table: 'dsi_ticket_categories', columns: lookup, orderBy: 'ordre, libelle', subModuleKey: SUB,
}));
router.use('/ticket-types', simpleCrudRouter({
  table: 'dsi_ticket_types', columns: lookup, orderBy: 'ordre, libelle', subModuleKey: SUB,
}));
router.use('/priorities', simpleCrudRouter({
  table: 'dsi_priorities', columns: ['code', 'libelle', 'rang', 'couleur', 'actif'],
  orderBy: 'rang, libelle', subModuleKey: SUB,
}));
router.use('/sla', simpleCrudRouter({
  table: 'dsi_sla', columns: ['priority_id', 'prise_en_charge_min', 'resolution_min', 'seuil_risque_pct', 'actif'],
  orderBy: 'id', subModuleKey: SUB,
}));
router.use('/maintenance-types', simpleCrudRouter({
  table: 'dsi_maintenance_types', columns: lookup, orderBy: 'ordre, libelle', subModuleKey: SUB,
}));
router.use('/activity-types', simpleCrudRouter({
  table: 'dsi_activity_types', columns: lookup, orderBy: 'ordre, libelle', subModuleKey: SUB,
}));
router.use('/risk-categories', simpleCrudRouter({
  table: 'dsi_risk_categories', columns: lookup, orderBy: 'ordre, libelle', subModuleKey: SUB,
}));

module.exports = router;
