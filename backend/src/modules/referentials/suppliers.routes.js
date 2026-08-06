const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModuleWrite } = require('../../middleware/permissions');
const suppliersService = require('./suppliers.service');

const router = express.Router();
const { withEntityIds } = suppliersService;
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('referentiels.suppliers');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    let suppliers;
    if (req.query.entity_id) {
      suppliers = await all(
        `SELECT s.* FROM suppliers s
         JOIN supplier_entities se ON se.supplier_id = s.id
         WHERE se.entity_id = $1
         ORDER BY s.nom`,
        [Number(req.query.entity_id)]
      );
    } else {
      suppliers = await all('SELECT * FROM suppliers ORDER BY nom');
    }
    res.json(await Promise.all(suppliers.map(withEntityIds)));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const supplier = await one('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (!supplier) return res.status(404).json({ error: 'Introuvable.' });
    res.json(await withEntityIds(supplier));
  } catch (e) { next(e); }
});

router.post('/', requireAuth, requireCreate, async (req, res, next) => {
  try {
    const { entity_ids, ...fields } = req.body || {};
    const supplier = await suppliersService.createSupplier(fields);
    for (const entityId of entity_ids || []) {
      await suppliersService.linkSupplierToEntity(supplier.id, entityId);
    }
    res.status(201).json(await withEntityIds(supplier));
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Introuvable.' });
    const b = req.body || {};
    const { entity_ids } = b;
    // Champ non fourni -> on garde l'existant ; champ fourni vide ('') -> NULL. Crucial pour `code`
    // (UNIQUE) : un '' au lieu de NULL entre en collision dès qu'un autre fournisseur a un code vide,
    // et pour `origine` (CHECK 'import'/'local') : un '' violerait la contrainte. D'où « erreur
    // serveur » intermittente à l'édition, corrigée ici.
    const field = (k) => (b[k] === undefined ? existing[k] : (b[k] === '' ? null : b[k]));

    let supplier;
    try {
      supplier = await one(
        `UPDATE suppliers SET
           nom=$1, contact_nom=$2, contact_email=$3, contact_tel=$4, adresse=$5, actif=$6,
           code=$7, origine=$8, pays=$9, categorie=$10, produits_offres=$11, mode_paiement=$12,
           conditions_paiement=$13, a_contrat=$14, commentaires=$15
         WHERE id=$16 RETURNING *`,
        [
          b.nom === undefined ? existing.nom : b.nom, // nom obligatoire : jamais mis à NULL
          field('contact_nom'), field('contact_email'), field('contact_tel'), field('adresse'),
          b.actif === undefined ? existing.actif : b.actif,
          field('code'), field('origine'), field('pays'), field('categorie'), field('produits_offres'),
          field('mode_paiement'), field('conditions_paiement'),
          b.a_contrat === undefined ? existing.a_contrat : b.a_contrat,
          field('commentaires'),
          req.params.id,
        ]
      );
    } catch (e) {
      // Mêmes messages clairs qu'à la création (suppliers.service) plutôt qu'un 500 générique.
      if (e.code === '23505') return res.status(409).json({ error: 'Ce code fournisseur est déjà utilisé — choisissez-en un autre (ou laissez-le vide).' });
      if (e.code === '23514') return res.status(400).json({ error: 'Origine invalide : choisissez « Import » ou « Local ».' });
      throw e;
    }

    if (entity_ids) {
      await run('DELETE FROM supplier_entities WHERE supplier_id = $1', [req.params.id]);
      // Set (dédoublonnage) : un entity_id en double ferait échouer l'INSERT sur la PK composite.
      for (const entityId of [...new Set(entity_ids)]) {
        await run('INSERT INTO supplier_entities (supplier_id, entity_id) VALUES ($1,$2)', [req.params.id, entityId]);
      }
    }
    res.json(await withEntityIds(supplier));
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    await run('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
