const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireModule } = require('../../middleware/permissions');

const router = express.Router();

async function withEntityIds(supplier) {
  const rows = await all('SELECT entity_id FROM supplier_entities WHERE supplier_id = $1', [supplier.id]);
  return { ...supplier, entity_ids: rows.map(r => r.entity_id) };
}

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

router.post('/', requireAuth, requireModule('ref_suppliers'), async (req, res, next) => {
  try {
    const {
      nom, contact_nom, contact_email, contact_tel, adresse, actif,
      code, origine, pays, categorie, produits_offres, mode_paiement, conditions_paiement, a_contrat, commentaires,
      entity_ids,
    } = req.body || {};
    if (!nom) return res.status(400).json({ error: 'nom obligatoire.' });
    const supplier = await one(
      `INSERT INTO suppliers
         (nom, contact_nom, contact_email, contact_tel, adresse, actif,
          code, origine, pays, categorie, produits_offres, mode_paiement, conditions_paiement, a_contrat, commentaires)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        nom, contact_nom || null, contact_email || null, contact_tel || null, adresse || null,
        actif === undefined ? true : actif,
        code || null, origine || null, pays || null, categorie || null, produits_offres || null,
        mode_paiement || null, conditions_paiement || null,
        a_contrat === undefined ? null : a_contrat, commentaires || null,
      ]
    );
    for (const entityId of entity_ids || []) {
      await run('INSERT INTO supplier_entities (supplier_id, entity_id) VALUES ($1,$2)', [supplier.id, entityId]);
    }
    res.status(201).json(await withEntityIds(supplier));
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, requireModule('ref_suppliers'), async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Introuvable.' });
    const {
      nom, contact_nom, contact_email, contact_tel, adresse, actif,
      code, origine, pays, categorie, produits_offres, mode_paiement, conditions_paiement, a_contrat, commentaires,
      entity_ids,
    } = req.body || {};
    const supplier = await one(
      `UPDATE suppliers SET
         nom=$1, contact_nom=$2, contact_email=$3, contact_tel=$4, adresse=$5, actif=$6,
         code=$7, origine=$8, pays=$9, categorie=$10, produits_offres=$11, mode_paiement=$12,
         conditions_paiement=$13, a_contrat=$14, commentaires=$15
       WHERE id=$16 RETURNING *`,
      [
        nom ?? existing.nom,
        contact_nom ?? existing.contact_nom,
        contact_email ?? existing.contact_email,
        contact_tel ?? existing.contact_tel,
        adresse ?? existing.adresse,
        actif === undefined ? existing.actif : actif,
        code ?? existing.code,
        origine ?? existing.origine,
        pays ?? existing.pays,
        categorie ?? existing.categorie,
        produits_offres ?? existing.produits_offres,
        mode_paiement ?? existing.mode_paiement,
        conditions_paiement ?? existing.conditions_paiement,
        a_contrat === undefined ? existing.a_contrat : a_contrat,
        commentaires ?? existing.commentaires,
        req.params.id,
      ]
    );
    if (entity_ids) {
      await run('DELETE FROM supplier_entities WHERE supplier_id = $1', [req.params.id]);
      for (const entityId of entity_ids) {
        await run('INSERT INTO supplier_entities (supplier_id, entity_id) VALUES ($1,$2)', [req.params.id, entityId]);
      }
    }
    res.json(await withEntityIds(supplier));
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireModule('ref_suppliers'), async (req, res, next) => {
  try {
    await run('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
