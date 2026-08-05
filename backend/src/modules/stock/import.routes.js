const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule, canWriteBusinessUnit } = require('../../middleware/permissions');

// Refonte Stock (Lot 5) — Import des mouvements historiques (fichiers « Mvt Stock Online <BU> »).
// Le fichier est parsé et mappé côté client ; le backend reçoit des lignes normalisées, résout les
// références (produit / type / localisation), valide, insère les mouvements valides et renvoie un
// rapport détaillé. Les quantités sont prises en valeur absolue (le sens vient du type).
const router = express.Router();
router.use(requireAuth);

const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
// Alias des libellés Excel courants → code de type de mouvement.
const TYPE_ALIAS = {
  'entree': 'entree', 'entrée': 'entree', 'sortie': 'sortie', 'stock initial': 'stock_initial',
  'promo': 'promo', 'don': 'don', 'non conforme': 'non_conforme', 'control qualite': 'controle_qualite',
  'controle qualite': 'controle_qualite', 'transfer': 'transfert', 'transfert': 'transfert',
  'retour': 'retour_client', 'reception fournisseur': 'reception_fournisseur',
};

router.post('/movements', requireSubModule('stock.import', 'ajout'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const buId = Number(b.business_unit_id);
    if (!buId) return res.status(400).json({ error: 'Business Unit requise.' });
    if (!canWriteBusinessUnit(req.user, buId)) return res.status(403).json({ error: 'Accès BU refusé.' });
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const createProducts = !!b.create_missing_products;
    const createLocations = !!b.create_missing_locations;

    // Référentiels en mémoire pour la résolution.
    const types = await all('SELECT id, code, libelle FROM stock_movement_types');
    const typeByKey = {};
    types.forEach(t => { typeByKey[norm(t.code)] = t; typeByKey[norm(t.libelle)] = t; });
    const resolveType = v => { const k = norm(v); return typeByKey[k] || typeByKey[norm(TYPE_ALIAS[k] || '')] || null; };

    let products = await all('SELECT id, code, designation, business_unit_id FROM products');
    const findProduct = (code, designation) => {
      const c = norm(code); const d = norm(designation);
      return products.find(p => c && norm(p.code) === c) || products.find(p => d && norm(p.designation) === d) || null;
    };
    let locations = await all('SELECT id, nom, business_unit_id FROM stock_locations');
    const findLocation = name => { const n = norm(name); return n ? locations.find(l => norm(l.nom) === n) : null; };
    const defaultCat = await one("SELECT id FROM product_categories WHERE code = 'produit_fini' LIMIT 1")
      || await one('SELECT id FROM product_categories ORDER BY id LIMIT 1');

    const report = { total: rows.length, inserted: 0, skipped: 0, errors: [], created_products: 0, created_locations: 0 };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; const ligne = i + 2; // +2 : en-tête + base 1
      try {
        const qte = Math.abs(Number(r.quantite));
        if (!qte || Number.isNaN(qte)) { report.errors.push({ ligne, message: 'Quantité invalide ou nulle.' }); report.skipped++; continue; }
        const type = resolveType(r.type);
        if (!type) { report.errors.push({ ligne, message: `Type de mouvement inconnu : « ${r.type} ».` }); report.skipped++; continue; }

        let product = findProduct(r.product_code, r.product_designation);
        if (!product) {
          if (!createProducts) { report.errors.push({ ligne, message: `Produit inconnu : « ${r.product_code || r.product_designation} ».` }); report.skipped++; continue; }
          product = await one('INSERT INTO products (code, designation, category_id, business_unit_id) VALUES ($1,$2,$3,$4) RETURNING id, code, designation, business_unit_id',
            [r.product_code || null, r.product_designation || r.product_code || 'Sans nom', defaultCat.id, buId]);
          products.push(product); report.created_products++;
        }

        let locId = null;
        if (r.localisation) {
          let loc = findLocation(r.localisation);
          if (!loc && createLocations) {
            loc = await one('INSERT INTO stock_locations (nom, type, business_unit_id) VALUES ($1,$2,$3) RETURNING id, nom, business_unit_id', [r.localisation, 'entrepot', buId]);
            locations.push(loc); report.created_locations++;
          }
          locId = loc ? loc.id : null;
        }

        const dateVal = r.date && /^\d{4}-\d{2}-\d{2}/.test(String(r.date)) ? String(r.date).slice(0, 10) : null;
        const valeur = r.valeur != null && r.valeur !== '' ? Math.abs(Number(r.valeur)) : null;
        const pu = valeur != null && qte ? valeur / qte : null;

        const m = await one(
          `INSERT INTO stock_ledger (date_mouvement, type_id, business_unit_id, location_id, statut, commentaire, reference_document, created_by, validated_by)
           VALUES (COALESCE($1,CURRENT_DATE),$2,$3,$4,'valide',$5,$6,$7,$7) RETURNING id`,
          [dateVal, type.id, buId, locId, r.commentaire || null, 'IMPORT', req.user.id]);
        await run('UPDATE stock_ledger SET reference = $1 WHERE id = $2', [`MV-${String(m.id).padStart(5, '0')}`, m.id]);
        await run('INSERT INTO stock_ledger_lines (movement_id, product_id, quantite, prix_unitaire, valeur) VALUES ($1,$2,$3,$4,$5)',
          [m.id, product.id, qte, pu, valeur]);
        report.inserted++;
      } catch (e) {
        report.errors.push({ ligne, message: e.message }); report.skipped++;
      }
    }
    res.json(report);
  } catch (e) { next(e); }
});

module.exports = router;
