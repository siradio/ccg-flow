const express = require('express');
const { pool, all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');

// Module Logistique — Checklists chauffeurs : gestion des MODÈLES (modèle + items ordonnés).
// Lecture pour tout détenteur du sous-module ; création/édition/suppression gatées.
const router = express.Router();
router.use(requireAuth);

// Nettoie et ordonne les items reçus du formulaire (libellés non vides uniquement).
function cleanItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(it => (typeof it === 'string' ? it : (it && it.libelle) || '').trim())
    .filter(Boolean)
    .map((libelle, i) => ({ libelle, ordre: i + 1 }));
}

router.get('/templates', requireSubModule('logistique.checklists'), async (req, res, next) => {
  try {
    const templates = await all('SELECT id, nom, type, actif, created_at FROM checklist_templates ORDER BY nom');
    const items = await all('SELECT id, template_id, libelle, ordre FROM checklist_template_items ORDER BY template_id, ordre');
    res.json(templates.map(t => ({ ...t, items: items.filter(i => i.template_id === t.id) })));
  } catch (e) { next(e); }
});

router.post('/templates', requireSubModule('logistique.checklists', 'ajout'), async (req, res, next) => {
  const { nom, type, items } = req.body || {};
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom du modèle est obligatoire.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [t] } = await client.query(
      'INSERT INTO checklist_templates (nom, type, actif) VALUES ($1,$2,$3) RETURNING id, nom, type, actif, created_at',
      [nom.trim(), (type || 'Départ'), true]
    );
    for (const it of cleanItems(items)) {
      await client.query('INSERT INTO checklist_template_items (template_id, libelle, ordre) VALUES ($1,$2,$3)', [t.id, it.libelle, it.ordre]);
    }
    await client.query('COMMIT');
    const list = await all('SELECT id, libelle, ordre FROM checklist_template_items WHERE template_id = $1 ORDER BY ordre', [t.id]);
    res.status(201).json({ ...t, items: list });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// Mise à jour : entête + REMPLACEMENT complet des items (simple et prévisible ; les réalisations
// passées gardent leur propre copie des items, donc rien n'est perdu côté historique).
router.put('/templates/:id', requireSubModule('logistique.checklists', 'edition'), async (req, res, next) => {
  const { nom, type, actif, items } = req.body || {};
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query('SELECT * FROM checklist_templates WHERE id = $1', [id]);
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Modèle introuvable.' }); }
    const { rows: [t] } = await client.query(
      'UPDATE checklist_templates SET nom = $1, type = $2, actif = $3 WHERE id = $4 RETURNING id, nom, type, actif, created_at',
      [(nom && nom.trim()) || existing.nom, type || existing.type, actif === undefined ? existing.actif : !!actif, id]
    );
    if (items !== undefined) {
      await client.query('DELETE FROM checklist_template_items WHERE template_id = $1', [id]);
      for (const it of cleanItems(items)) {
        await client.query('INSERT INTO checklist_template_items (template_id, libelle, ordre) VALUES ($1,$2,$3)', [id, it.libelle, it.ordre]);
      }
    }
    await client.query('COMMIT');
    const list = await all('SELECT id, libelle, ordre FROM checklist_template_items WHERE template_id = $1 ORDER BY ordre', [id]);
    res.json({ ...t, items: list });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

router.delete('/templates/:id', requireSubModule('logistique.checklists', 'edition'), async (req, res, next) => {
  try {
    await run('DELETE FROM checklist_templates WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
