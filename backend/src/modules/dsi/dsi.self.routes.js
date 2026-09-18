// Espace salarié DSI — self-service ouvert à TOUT utilisateur authentifié (aucun sous-module DSI
// requis). Un salarié déclare un incident/demande, suit et commente SES tickets (sans voir les
// informations internes réservées à la DSI).
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');
const { httpError } = require('../../utils/httpError');
const repo = require('./dsi.tickets.repository');
const svc = require('./dsi.tickets.service');

const router = express.Router();
router.use(requireAuth);
// Espace salarié réservé aux comptes ayant l'accès self-service DSI (attribuable dans Admin →
// Utilisateurs : sous-module « dsi.support »).
router.use(requireSubModule('dsi.support', 'consultation'));

router.post('/tickets', async (req, res, next) => {
  try { res.status(201).json(await svc.create(req.user, req.body || {}, { selfService: true })); } catch (e) { next(e); }
});

router.get('/tickets', async (req, res, next) => {
  try {
    const data = await repo.list({ demandeurId: req.user.id, page: req.query.page ? Number(req.query.page) : 1, pageSize: 50 });
    res.json({ ...data, items: data.items.map(svc.withSla) });
  } catch (e) { next(e); }
});

async function ownTicket(req) {
  const t = await repo.getById(Number(req.params.id));
  if (!t) throw httpError(404, 'Ticket introuvable.');
  if (t.demandeur_id !== req.user.id) throw httpError(403, 'Accès non autorisé à ce ticket.');
  return t;
}

router.get('/tickets/:id', async (req, res, next) => {
  try {
    const t = await ownTicket(req);
    // Le demandeur ne voit que la timeline publique (pas l'interne DSI).
    res.json({ ...svc.withSla(t), events: await repo.events(t.id, true) });
  } catch (e) { next(e); }
});

router.post('/tickets/:id/comment', async (req, res, next) => {
  try {
    await ownTicket(req);
    res.json(await svc.comment(req.user, Number(req.params.id), req.body?.comment, 'public'));
  } catch (e) { next(e); }
});

module.exports = router;
