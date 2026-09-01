const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, requireSubModuleWrite } = require('../../middleware/permissions');
const service = require('./employees.service');
const permisAlerts = require('./permis-alerts');
const settings = require('../settings/settings.service');

const router = express.Router();
router.use(requireAuth);
router.use(requireSubModule('rh'));
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('rh');

// Configuration de l'alerte d'expiration des permis de travail. Lecture ouverte à tout accès RH ;
// modification et envoi manuel réservés au niveau ÉDITION du sous-module RH (droit d'ajout/suppression).
// Définis AVANT /:id pour ne pas être captés par la route dynamique.
router.get('/permis-alert/config', async (req, res, next) => {
  try {
    const actif = String(await settings.getValue('permis_alert_actif', 'false')) === 'true';
    const jours = await settings.getIntValue('permis_alert_jours', 30);
    const raw = String((await settings.getValue('permis_alert_emails', '')) || '');
    res.json({ actif, jours, emails: raw === '—' ? '' : raw }); // '—' = placeholder d'enregistrement vide
  } catch (e) { next(e); }
});
router.put('/permis-alert/config', requireEdit, async (req, res, next) => {
  try {
    const b = req.body || {};
    await settings.setValue('permis_alert_actif', b.actif ? 'true' : 'false');
    await settings.setValue('permis_alert_jours', String(b.jours || '30'));
    await settings.setValue('permis_alert_emails', b.emails || '—');
    res.json(await permisAlerts.getConfig());
  } catch (e) { next(e); }
});
// Envoi immédiat du récap (test / relance manuelle), aux destinataires configurés ou, à défaut, à
// l'utilisateur connecté. Niveau édition RH.
router.post('/permis-alert/test-alert', requireEdit, async (req, res, next) => {
  try {
    const { jours, emails } = await permisAlerts.getConfig();
    const to = emails.length ? emails : [req.user.email].filter(Boolean);
    if (!to.length) return res.status(400).json({ error: 'Aucun destinataire (configurez des emails ou ayez une adresse sur votre compte).' });
    const r = await permisAlerts.sendDigestTo(to, jours || 30);
    res.json({ ...r, to });
  } catch (e) { next(e); }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { q, entity_id, business_unit_id, statut, departement } = req.query;
    res.json(await service.list({
      q,
      entityId: entity_id ? Number(entity_id) : null,
      businessUnitId: business_unit_id ? Number(business_unit_id) : null,
      statut,
      departement,
    }));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const employee = await service.getById(Number(req.params.id));
    if (!employee) return res.status(404).json({ error: 'Employé introuvable.' });
    res.json(employee);
  } catch (e) { next(e); }
});

router.post('/', requireAuth, requireCreate, async (req, res, next) => {
  try {
    const { nom, prenom, entity_id } = req.body || {};
    if (!nom || !prenom || !entity_id) {
      return res.status(400).json({ error: 'nom, prenom et entity_id sont obligatoires.' });
    }
    res.status(201).json(await service.create(req.body));
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const updated = await service.update(Number(req.params.id), req.body || {});
    if (!updated) return res.status(404).json({ error: 'Employé introuvable.' });
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    await service.remove(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
