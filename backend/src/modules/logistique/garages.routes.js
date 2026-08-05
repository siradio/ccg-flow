const express = require('express');
const { all } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const { simpleCrudRouter } = require('../referentials/crud.factory');

// Garages partenaires (référentiel) + endpoint agrégé /with-stats pour l'écran « Garages &
// réparations » (nb en réparation, coût total, durée moyenne). Défini avant le CRUD générique (dont
// le GET /:id, qui capterait sinon « with-stats »).
const router = express.Router();

router.get('/with-stats', requireAuth, requireSubModule('logistique.maintenance'), async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT g.id, g.nom, g.ville, g.sous_contrat, g.specialites, g.efficacite_pct, g.telephone, g.notes, g.actif,
              (SELECT COUNT(*) FROM reparations r WHERE r.garage_id = g.id AND r.statut = 'En cours')::int AS en_reparation,
              (SELECT COALESCE(SUM(r.cout), 0) FROM reparations r WHERE r.garage_id = g.id)::float AS cout_total,
              (SELECT AVG(EXTRACT(EPOCH FROM (r.date_fin - r.date_debut)) / 86400.0)
                 FROM reparations r WHERE r.garage_id = g.id AND r.date_fin IS NOT NULL)::float AS duree_moy_jours
       FROM garages g ORDER BY g.nom`
    ));
  } catch (e) { next(e); }
});

router.use(simpleCrudRouter({
  table: 'garages',
  columns: ['nom', 'ville', 'sous_contrat', 'specialites', 'efficacite_pct', 'telephone', 'notes', 'actif'],
  orderBy: 'nom',
  subModuleKey: 'logistique.maintenance',
}));

module.exports = router;
