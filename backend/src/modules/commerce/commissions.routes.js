const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const {
  requireSubModule, requireSubModuleWrite, visibleBusinessUnitIds, canWriteBusinessUnit,
} = require('../../middleware/permissions');
const { logAction } = require('../audit/audit.service');

// Moteur de commissions/primes. Barème paramétrable par palier de CA mensuel (global ou par BU) ;
// commission = CA validé du mois × taux du palier applicable. Le taux/montant sont FIGÉS à la ligne :
// une commission validée ou payée n'est jamais recalculée (voir /calculer).
const router = express.Router();
const { create: requireCreate, edit: requireEdit } = requireSubModuleWrite('commerce.commissions');
const LOCKED = ['validee', 'payee'];

// Palier applicable : dans le périmètre (BU spécifique sinon global), valide à la période, plus haut
// palier_min <= base. Renvoie { taux, rule_id }.
function pickRule(base, buId, rules, periode, monthEnd) {
  const validAt = (r) => (!r.date_debut || r.date_debut <= monthEnd) && (!r.date_fin || r.date_fin >= periode);
  let scope = rules.filter(r => r.actif && Number(r.business_unit_id) === Number(buId) && validAt(r));
  if (!scope.length) scope = rules.filter(r => r.actif && r.business_unit_id === null && validAt(r));
  const applicable = scope.filter(r => Number(r.palier_min) <= base).sort((a, b) => Number(b.palier_min) - Number(a.palier_min));
  return applicable.length ? { taux: Number(applicable[0].taux), rule_id: applicable[0].id } : { taux: 0, rule_id: null };
}

// --- Barème -------------------------------------------------------------------------------
router.get('/bareme', requireAuth, requireSubModule('commerce.commissions'), async (req, res, next) => {
  try {
    res.json(await all(`SELECT r.*, bu.nom AS business_unit_nom FROM commission_rules r
      LEFT JOIN business_units bu ON bu.id = r.business_unit_id
      ORDER BY r.business_unit_id NULLS FIRST, r.palier_min`));
  } catch (e) { next(e); }
});

router.post('/bareme', requireAuth, requireCreate, async (req, res, next) => {
  try {
    const b = req.body || {};
    const buId = b.business_unit_id ? Number(b.business_unit_id) : null;
    if (buId && !canWriteBusinessUnit(req.user, buId)) return res.status(403).json({ error: 'BU non autorisée.' });
    const row = await one(`INSERT INTO commission_rules (business_unit_id, palier_min, taux, actif, date_debut, date_fin)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [buId, Number(b.palier_min) || 0, Number(b.taux) || 0, b.actif !== false, b.date_debut || null, b.date_fin || null]);
    res.status(201).json(await one('SELECT * FROM commission_rules WHERE id = $1', [row.id]));
  } catch (e) { next(e); }
});

router.put('/bareme/:id', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const b = req.body || {};
    await run(`UPDATE commission_rules SET palier_min = $2, taux = $3, actif = $4, business_unit_id = $5,
                 date_debut = $6, date_fin = $7 WHERE id = $1`,
      [Number(req.params.id), Number(b.palier_min) || 0, Number(b.taux) || 0, b.actif !== false,
       b.business_unit_id ? Number(b.business_unit_id) : null, b.date_debut || null, b.date_fin || null]);
    res.json(await one('SELECT * FROM commission_rules WHERE id = $1', [Number(req.params.id)]));
  } catch (e) { next(e); }
});

router.delete('/bareme/:id', requireAuth, requireEdit, async (req, res, next) => {
  try { await run('DELETE FROM commission_rules WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// --- Commissions du mois -------------------------------------------------------------------
const HEADER = `
  SELECT co.*, c.code AS commercial_code,
         COALESCE(e.nom, c.nom) AS commercial_nom, COALESCE(e.prenom, c.prenom) AS commercial_prenom,
         bu.nom AS business_unit_nom,
         TRIM(CONCAT(uv.prenom, ' ', uv.nom)) AS valide_par
    FROM commissions co
    JOIN commerciaux c ON c.id = co.commercial_id
    LEFT JOIN employees e ON e.id = c.employee_id
    LEFT JOIN business_units bu ON bu.id = co.business_unit_id
    LEFT JOIN users uv ON uv.id = co.validated_by`;

router.get('/', requireAuth, requireSubModule('commerce.commissions'), async (req, res, next) => {
  try {
    const mois = /^\d{4}-\d{2}$/.test(req.query.mois || '') ? req.query.mois : new Date().toISOString().slice(0, 7);
    const periode = `${mois}-01`;
    const where = ['co.periode = $1'];
    const params = [periode];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible) { params.push(visible); where.push(`co.business_unit_id = ANY($${params.length})`); }
    if (req.query.business_unit_id) { params.push(Number(req.query.business_unit_id)); where.push(`co.business_unit_id = $${params.length}`); }
    res.json(await all(HEADER + ' WHERE ' + where.join(' AND ') + ' ORDER BY co.montant DESC', params));
  } catch (e) { next(e); }
});

// Calcule (ou recalcule) les commissions du mois. Ne touche jamais une commission validée/payée.
router.post('/calculer', requireAuth, requireEdit, async (req, res, next) => {
  try {
    const mois = /^\d{4}-\d{2}$/.test((req.body || {}).mois || '') ? req.body.mois : new Date().toISOString().slice(0, 7);
    const [year, month] = mois.split('-').map(Number);
    const periode = `${mois}-01`;
    const monthEnd = `${mois}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    const rules = await all('SELECT * FROM commission_rules');

    const where = ["c.statut = 'actif'"];
    const params = [periode, monthEnd];
    const visible = visibleBusinessUnitIds(req.user);
    if (visible) { params.push(visible); where.push(`c.business_unit_id = ANY($${params.length})`); }
    const bases = await all(`
      SELECT c.id, c.business_unit_id, COALESCE(SUM(cp.total_amount), 0) AS base
        FROM commerciaux c
        LEFT JOIN commercial_payments cp ON cp.commercial_id = c.id AND cp.status = 'valide'
             AND cp.payment_date >= $1 AND cp.payment_date <= $2
       WHERE ${where.join(' AND ')}
       GROUP BY c.id, c.business_unit_id`, params);

    let computed = 0, lockedSkipped = 0;
    for (const r of bases) {
      const base = Number(r.base);
      if (base <= 0) continue;
      const { taux, rule_id } = pickRule(base, r.business_unit_id, rules, periode, monthEnd);
      const montant = Math.round(base * taux);
      const existing = await one('SELECT id, statut FROM commissions WHERE periode = $1 AND commercial_id = $2', [periode, r.id]);
      if (existing && LOCKED.includes(existing.statut)) { lockedSkipped++; continue; }
      if (existing) {
        await run(`UPDATE commissions SET base_montant = $2, taux = $3, montant = $4, rule_id = $5,
                     business_unit_id = $6, statut = 'calculee', updated_at = now() WHERE id = $1`,
          [existing.id, base, taux, montant, rule_id, r.business_unit_id]);
      } else {
        await run(`INSERT INTO commissions (periode, commercial_id, business_unit_id, base_montant, taux, montant, rule_id, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [periode, r.id, r.business_unit_id, base, taux, montant, rule_id, req.user.id]);
      }
      computed++;
    }
    await logAction({ tableName: 'commissions', recordId: 0, action: 'calcul', userId: req.user.id, details: { mois, computed, lockedSkipped } });
    res.json({ mois, computed, lockedSkipped });
  } catch (e) { next(e); }
});

// Transitions de statut.
async function setStatut(req, res, next, { from, to, extra }) {
  try {
    const id = Number(req.params.id);
    const co = await one('SELECT * FROM commissions WHERE id = $1', [id]);
    if (!co) return res.status(404).json({ error: 'Commission introuvable.' });
    if (!canWriteBusinessUnit(req.user, co.business_unit_id)) return res.status(403).json({ error: 'BU non autorisée.' });
    if (from && !from.includes(co.statut)) return res.status(409).json({ error: `Transition impossible depuis « ${co.statut} ».` });
    const sets = ['statut = $2', 'updated_at = now()'];
    const params = [id, to];
    if (extra === 'validate') sets.push(`validated_by = ${Number(req.user.id)}`, 'validated_at = now()');
    if (extra === 'pay') sets.push('paid_at = now()');
    if (extra === 'cancel') { params.push((req.body || {}).motif || null); sets.push(`motif = $${params.length}`); }
    await run(`UPDATE commissions SET ${sets.join(', ')} WHERE id = $1`, params);
    await logAction({ tableName: 'commissions', recordId: id, action: to, userId: req.user.id, details: {} });
    res.json(await one(HEADER + ' WHERE co.id = $1', [id]));
  } catch (e) { next(e); }
}
router.post('/:id/validate', requireAuth, requireEdit, (req, res, next) => setStatut(req, res, next, { from: ['calculee'], to: 'validee', extra: 'validate' }));
router.post('/:id/pay', requireAuth, requireEdit, (req, res, next) => setStatut(req, res, next, { from: ['validee'], to: 'payee', extra: 'pay' }));
router.post('/:id/cancel', requireAuth, requireEdit, (req, res, next) => setStatut(req, res, next, { from: ['calculee', 'validee'], to: 'annulee', extra: 'cancel' }));

module.exports = router;
